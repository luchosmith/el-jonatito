// Daily log, availability, schedule, media and the "here & now" info.
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { canonicalSymbol } from '../dispatcher.ts';
import path from 'node:path';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile } from '../http.ts';
import { audit, getLog, imageUrl, logsBetween } from '../repo.ts';
import { IMAGE_MIME, MEDIA_MIME, saveImage, saveMedia } from '../uploads.ts';
import { num, obj, oneOf, str } from '../validate.ts';
import { inWindow, localDay, minutesOfDay, seasonOf, startOfDay } from '../../shared/time.ts';
import type { LogEntry, MediaItem, MediaPolicy, ScheduleDay, ScheduleItem } from '../../shared/types.ts';

const LOG_TYPES = ['food', 'drink', 'meds', 'sleep', 'toilet', 'mood', 'activity'] as const;
const MAX_MEDIA = 300 * 1024 * 1024;
const MAX_PHOTO = 8 * 1024 * 1024;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const status = oneOf(body, 'status', ['available', 'busy', 'away'] as const)!;
    const mins = num(body, 'until_minutes', { optional: true, min: 1, max: 24 * 60 });
    const until = status !== 'available' && mins ? new Date(now().getTime() + mins * 60_000).toISOString() : null;
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
    db.all<{ id: number; emoji: string; label: string; start_min: number; symbol_id: string | null; choices: string | null }>('SELECT * FROM schedule_items ORDER BY start_min')
      .map((r) => ({ id: r.id, symbol_emoji: r.emoji, label: r.label, symbol_id: r.symbol_id, start_min: r.start_min, choices: r.choices ? JSON.parse(r.choices) as string[] : [] })),
  );

  // ---- A day's pick for a routine slot ("breakfast tomorrow: eggs", or a photo for that day only) ----
  const DAY_SQL = `SELECT d.schedule_id, d.day, d.item_id, d.label,
      (SELECT file FROM images im WHERE im.owner_type = 'schedule_day' AND im.owner_id = d.schedule_id || ':' || d.day AND im.is_active = 1 ORDER BY im.id DESC LIMIT 1) AS photo,
      (SELECT COALESCE(i.short_label, u.username) FROM users u LEFT JOIN items i ON i.id = u.person_id WHERE u.id = d.set_by) AS by
    FROM schedule_days d`;
  type DayRow = { schedule_id: number; day: string; item_id: string | null; label: string | null; photo: string | null; by: string | null };
  const toDay = (r: DayRow): ScheduleDay => ({ schedule_id: r.schedule_id, day: r.day, item_id: r.item_id, label: r.label, photo_url: imageUrl(r.photo), set_by: r.by });
  const dayParam = (v: string | null | undefined) => {
    if (!v || !DAY_RE.test(v) || Number.isNaN(new Date(`${v}T12:00:00`).getTime())) throw new HttpError(400, 'day must be YYYY-MM-DD');
    return v;
  };
  const slot = (id: string) => {
    const r = db.get<{ id: number }>('SELECT id FROM schedule_items WHERE id = ?', Number(id));
    if (!r) throw new HttpError(404, 'Unknown routine item');
    return r.id;
  };
  const getDay = (id: number, day: string) => {
    const r = db.get<DayRow>(`${DAY_SQL} WHERE d.schedule_id = ? AND d.day = ?`, id, day);
    return r ? toDay(r) : null;
  };
  const dayChanged = (userId: number, action: string, id: number, day: string) => {
    audit(db, userId, action, `${id}:${day}`, now().toISOString());
    hub.publish('all', { type: 'schedule' });
  };

  router.get('/api/schedule/days', requireAuth(), (ctx): ScheduleDay[] => {
    const from = dayParam(ctx.url.searchParams.get('from') ?? localDay(new Date(now().getTime() - 2 * 86_400_000)));
    const to = dayParam(ctx.url.searchParams.get('to') ?? localDay(new Date(now().getTime() + 31 * 86_400_000)));
    return db.all<DayRow>(`${DAY_SQL} WHERE d.day >= ? AND d.day <= ? ORDER BY d.day`, from, to).map(toDay);
  });

  /** Pick one of his foods for that day ({item_id}), or just words for a custom photo ({label}). */
  router.put('/api/schedule/:id/days/:day', requireAuth('caretaker'), jsonBody, (ctx) => {
    const id = slot(ctx.params.id);
    const day = dayParam(ctx.params.day);
    const b = obj(ctx.body);
    const itemId = str(b, 'item_id', { optional: true, max: 60 }) ?? null;
    const label = str(b, 'label', { optional: true, max: 60 })?.trim() || null;
    if (!itemId && !label) throw new HttpError(400, 'Pick a food (item_id) or give words (label)');
    if (itemId && !db.get("SELECT 1 FROM items WHERE id = ? AND category IN ('food','drink')", itemId)) throw new HttpError(400, 'Pick one of his foods or drinks');
    db.run(
      `INSERT INTO schedule_days(schedule_id, day, item_id, label, set_by, updated_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(schedule_id, day) DO UPDATE SET item_id = excluded.item_id, label = excluded.label, set_by = excluded.set_by, updated_at = excluded.updated_at`,
      id, day, itemId, label, ctx.user!.id, now().toISOString(),
    );
    // A food replaces that day's custom photo.
    if (itemId) db.run("UPDATE images SET is_active = 0 WHERE owner_type = 'schedule_day' AND owner_id = ?", `${id}:${day}`);
    dayChanged(ctx.user!.id, 'schedule.pick', id, day);
    return getDay(id, day);
  });

  router.put('/api/schedule/:id/days/:day/image', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    const id = slot(ctx.params.id);
    const day = dayParam(ctx.params.day);
    const file = saveImage(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const t = now().toISOString();
    db.run(
      `INSERT INTO schedule_days(schedule_id, day, item_id, label, set_by, updated_at) VALUES(?,?,NULL,NULL,?,?)
       ON CONFLICT(schedule_id, day) DO UPDATE SET item_id = NULL, set_by = excluded.set_by, updated_at = excluded.updated_at`,
      id, day, ctx.user!.id, t,
    );
    db.run("INSERT INTO images(owner_type, owner_id, file, is_active, uploaded_by, created_at) VALUES('schedule_day',?,?,1,?,?)", `${id}:${day}`, file, ctx.user!.id, t);
    dayChanged(ctx.user!.id, 'schedule.photo', id, day);
    return getDay(id, day);
  });

  /** Back to the everyday picture. */
  router.delete('/api/schedule/:id/days/:day', requireAuth('caretaker'), (ctx) => {
    const id = slot(ctx.params.id);
    const day = dayParam(ctx.params.day);
    db.run('DELETE FROM schedule_days WHERE schedule_id = ? AND day = ?', id, day);
    db.run("UPDATE images SET is_active = 0 WHERE owner_type = 'schedule_day' AND owner_id = ?", `${id}:${day}`);
    dayChanged(ctx.user!.id, 'schedule.default', id, day);
    return { ok: true };
  });

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
    const m = db.get<{ id: number; bedtime_ok: number }>('SELECT id, bedtime_ok FROM media WHERE id = ?', Number(ctx.params.id));
    if (!m) throw new HttpError(404, 'Unknown media');
    const lock = lockState();
    if (lock.locked && !m.bedtime_ok) throw new HttpError(423, 'Media is sleeping', { unlock_at: lock.unlock_at });
    const start = now();
    const ends = new Date(start.getTime() + policy().session_max_min * 60_000);
    db.run('INSERT INTO media_sessions(media_id, started_at, ends_at) VALUES(?,?,?)', m.id, start.toISOString(), ends.toISOString());
    return { media_id: m.id, started_at: start.toISOString(), ends_at: ends.toISOString() };
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
