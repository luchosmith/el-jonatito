// Daily log, availability, schedule, media and the "here & now" info.
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { canonicalSymbol } from '../dispatcher.ts';
import path from 'node:path';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile } from '../http.ts';
import { audit, getLog, imageUrl, isWithJonatito, logsBetween } from '../repo.ts';
import { MEDIA_MIME, saveMedia } from '../uploads.ts';
import { num, obj, oneOf, str } from '../validate.ts';
import { inWindow, minutesOfDay, seasonOf, startOfDay } from '../../shared/time.ts';
import type { LogEntry, MediaItem, MediaPolicy, ScheduleItem, SongList } from '../../shared/types.ts';

const LOG_TYPES = ['food', 'drink', 'meds', 'sleep', 'toilet', 'mood', 'activity'] as const;
const MAX_MEDIA = 300 * 1024 * 1024;

export function dayRoutes({ router, db, hub, now, cfg, weather }: Deps) {
  // ---- Daily log -------------------------------------------------------------
  router.post('/api/logs', requireAuth('caretaker'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const type = oneOf(body, 'type', LOG_TYPES)!;
    let symbol = str(body, 'symbol_id', { optional: true, max: 60 }) ?? null;
    if (symbol) {
      if (!db.get("SELECT 1 FROM items WHERE id = ? AND category NOT IN ('person','pet')", symbol)) throw new HttpError(400, 'Unknown symbol');
      symbol = canonicalSymbol(db, symbol);
    }
    const amount = num(body, 'amount', { optional: true, min: 0, max: 1 }) ?? null;
    const note = str(body, 'note', { optional: true, max: 300 }) ?? null;
    const atStr = str(body, 'at', { optional: true, max: 40 });
    const at = atStr ? new Date(atStr) : now();
    if (Number.isNaN(at.getTime())) throw new HttpError(400, 'at is not a date');
    const r = db.run('INSERT INTO log_entries(type, symbol_id, amount, note, at, entered_by) VALUES(?,?,?,?,?,?)',
      type, symbol, amount, note, at.toISOString(), ctx.user!.id);
    const entry = getLog(db, r.lastId) as LogEntry;
    hub.publish('all', { type: 'log', entry });
    return entry;
  });

  router.get('/api/logs', requireAuth(), (ctx) => {
    const day = ctx.url.searchParams.get('day');
    const start = day ? new Date(`${day}T00:00:00`) : startOfDay(now());
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Bad day');
    const end = new Date(start.getTime() + 24 * 3600_000);
    return logsBetween(db, start.toISOString(), end.toISOString());
  });

  router.delete('/api/logs/:id', requireAuth('caretaker'), (ctx) => {
    const r = db.run('DELETE FROM log_entries WHERE id = ?', Number(ctx.params.id));
    if (!r.changes) throw new HttpError(404, 'Unknown entry');
    return { ok: true };
  });

  // ---- Availability ----------------------------------------------------------
  router.put('/api/availability', requireAuth('caretaker', 'friend'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const status = oneOf(body, 'status', ['available', 'busy', 'away', 'on_duty'] as const)!;
    // On duty: caretakers only, and only when they are with him (their Where I am is home).
    if (status === 'on_duty') {
      if (ctx.user!.role !== 'caretaker') throw new HttpError(403, 'Only caretakers can be on duty');
      if (!isWithJonatito(db, cfg, ctx.user!.id, now())) throw new HttpError(409, 'You can be on duty only when you are with Jonatito: set Where I am to Home first');
    }
    const mins = num(body, 'until_minutes', { optional: true, min: 1, max: 24 * 60 });
    const until = status !== 'available' && status !== 'on_duty' && mins ? new Date(now().getTime() + mins * 60_000).toISOString() : null;
    db.run(
      `INSERT INTO availability(user_id, status, until, updated_at) VALUES(?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, until = excluded.until, updated_at = excluded.updated_at`,
      ctx.user!.id, status, until, now().toISOString(),
    );
    const personId = ctx.user!.person_id;
    if (personId) hub.publish('all', { type: 'availability', person_id: personId, status, until });
    return { status, until };
  });

  // ---- Schedule & here-and-now ------------------------------------------------
  router.get('/api/schedule', requireAuth(), (): ScheduleItem[] =>
    db.all<{ id: number; emoji: string; label: string; start_min: number; symbol_id: string | null; end_min: number | null; big: number }>('SELECT * FROM schedule_items ORDER BY start_min')
      .map((r) => ({ id: r.id, symbol_emoji: r.emoji, label: r.label, symbol_id: r.symbol_id, start_min: r.start_min, end_min: r.end_min, big: !!r.big })),
  );

  router.get('/api/now', requireAuth(), async () => {
    const t = now();
    return { now: t.toISOString(), season: seasonOf(t, cfg.hemisphere), weather: await weather(), place: cfg.placeName };
  });

  // ---- Media (with sleep lock enforced on the server) -------------------------
  const policy = () => db.setting<MediaPolicy>('media_policy', { session_max_min: 15, sleep_start_min: 1230, sleep_end_min: 420 });
  const lockState = () => {
    const p = policy();
    const t = now();
    const locked = inWindow(minutesOfDay(t), p.sleep_start_min, p.sleep_end_min);
    let unlockAt: string | null = null;
    if (locked) {
      const u = startOfDay(t);
      u.setMinutes(p.sleep_end_min);
      if (u <= t) u.setDate(u.getDate() + 1);
      unlockAt = u.toISOString();
    }
    return { locked, unlock_at: unlockAt };
  };

  router.get('/api/media', requireAuth(), () => {
    const items: MediaItem[] = db
      .all<{ id: number; title: string; kind: MediaItem['kind']; emoji: string | null; bedtime_ok: number; sort_order: number; cover: string | null; file: string | null }>(
        `SELECT m.*, (SELECT file FROM images i WHERE i.owner_type='media' AND i.owner_id=CAST(m.id AS TEXT) AND i.is_active=1 ORDER BY i.id DESC LIMIT 1) AS cover
         FROM media m ORDER BY sort_order`,
      )
      .map((m) => ({
        id: m.id, title: m.title, kind: m.kind, emoji: m.emoji, cover_url: imageUrl(m.cover), bedtime_ok: !!m.bedtime_ok, sort_order: m.sort_order,
        file_url: m.file ? `/api/media/${m.id}/file` : null,
      }));
    return { items, policy: policy(), ...lockState() };
  });

  router.post('/api/media/:id/play', requireAuth('child', 'caretaker'), (ctx) => {
    const m = db.get<{ id: number; bedtime_ok: number; kind: string; file: string | null }>('SELECT id, bedtime_ok, kind, file FROM media WHERE id = ?', Number(ctx.params.id));
    if (!m) throw new HttpError(404, 'Unknown media');
    const lock = lockState();
    if (lock.locked && !m.bedtime_ok) throw new HttpError(423, 'Media is sleeping', { unlock_at: lock.unlock_at });
    const start = now();
    // A real film (Pongo: 101 Dalmatians) and his music keep going until bedtime; everything else gets the media session.
    let ends = new Date(start.getTime() + policy().session_max_min * 60_000);
    if ((m.file && m.kind === 'movie') || m.kind === 'music') {
      ends = startOfDay(start);
      ends.setMinutes(policy().sleep_start_min);
      if (ends <= start) ends.setDate(ends.getDate() + 1);
    }
    db.run('INSERT INTO media_sessions(media_id, started_at, ends_at) VALUES(?,?,?)', m.id, start.toISOString(), ends.toISOString());
    return { media_id: m.id, started_at: start.toISOString(), ends_at: ends.toISOString() };
  });

  // ---- His songs (🎧 Music) -------------------------------------------------------------------
  router.get('/api/songs', requireAuth(), (ctx): SongList => {
    const all = ctx.user!.role !== 'child';
    const songs = db.all<{ id: number; title: string; artist: string | null; cover: string | null; hidden: number }>(
      `SELECT id, title, artist, cover, hidden FROM songs ${all ? '' : 'WHERE hidden = 0'} ORDER BY id`,
    ).map((s) => ({ id: s.id, title: s.title, artist: s.artist, cover_url: imageUrl(s.cover), audio_url: `/api/songs/${s.id}/file`, hidden: !!s.hidden }));
    return { songs, ...lockState() };
  });

  router.get('/api/songs/:id/file', requireAuth(), (ctx) => {
    const s = db.get<{ file: string }>('SELECT file FROM songs WHERE id = ?', Number(ctx.params.id));
    if (!s) throw new HttpError(404, 'Unknown song');
    const lock = lockState();
    if (lock.locked && ctx.user!.role === 'child') throw new HttpError(423, 'Music is sleeping', { unlock_at: lock.unlock_at });
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'songs'), s.file), 'private, max-age=86400');
  });

  // The video / song itself. The sleep lock applies here too, so a saved link can't get around it.
  router.get('/api/media/:id/file', requireAuth(), (ctx) => {
    const m = db.get<{ file: string | null; bedtime_ok: number }>('SELECT file, bedtime_ok FROM media WHERE id = ?', Number(ctx.params.id));
    if (!m?.file) throw new HttpError(404, 'No file for this media');
    const lock = lockState();
    if (lock.locked && !m.bedtime_ok && ctx.user!.role === 'child') throw new HttpError(423, 'Media is sleeping', { unlock_at: lock.unlock_at });
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'media'), m.file), 'private, max-age=3600');
  });

  router.put('/api/media/:id/file', requireAuth('caretaker'), rawBody(MEDIA_MIME, MAX_MEDIA), (ctx) => {
    const id = Number(ctx.params.id);
    if (!db.get('SELECT 1 FROM media WHERE id = ?', id)) throw new HttpError(404, 'Unknown media');
    const file = saveMedia(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run('UPDATE media SET file = ? WHERE id = ?', file, id);
    audit(db, ctx.user!.id, 'media.file', String(id), now().toISOString());
    hub.publish('all', { type: 'items' });
    return { ok: true, file_url: `/api/media/${id}/file` };
  });
}
