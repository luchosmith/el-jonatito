// Daily log, availability, schedule, media and the "here & now" info.
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { canonicalSymbol } from '../dispatcher.ts';
import { HttpError, jsonBody } from '../http.ts';
import { getLog, imageUrl, logsBetween } from '../repo.ts';
import { num, obj, oneOf, str } from '../validate.ts';
import { inWindow, minutesOfDay, seasonOf, startOfDay } from '../../shared/time.ts';
import type { LogEntry, MediaItem, MediaPolicy, ScheduleItem } from '../../shared/types.ts';

const LOG_TYPES = ['food', 'drink', 'meds', 'sleep', 'toilet', 'mood', 'activity'] as const;

export function dayRoutes({ router, db, hub, now, cfg, weather }: Deps) {
  // ---- Daily log -------------------------------------------------------------
  router.post('/api/logs', requireAuth('caretaker'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const type = oneOf(body, 'type', LOG_TYPES)!;
    let symbol = str(body, 'symbol_id', { optional: true, max: 60 }) ?? null;
    if (symbol) {
      if (!db.get('SELECT 1 FROM symbols WHERE id = ?', symbol)) throw new HttpError(400, 'Unknown symbol');
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
    db.all<{ id: number; emoji: string; label: string; start_min: number }>('SELECT * FROM schedule_items ORDER BY start_min')
      .map((r) => ({ id: r.id, symbol_emoji: r.emoji, label: r.label, start_min: r.start_min })),
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
      .all<{ id: number; title: string; kind: MediaItem['kind']; emoji: string | null; bedtime_ok: number; sort_order: number; cover: string | null }>(
        `SELECT m.*, (SELECT file FROM images i WHERE i.owner_type='media' AND i.owner_id=CAST(m.id AS TEXT) AND i.is_active=1 ORDER BY i.id DESC LIMIT 1) AS cover
         FROM media m ORDER BY sort_order`,
      )
      .map((m) => ({ id: m.id, title: m.title, kind: m.kind, emoji: m.emoji, cover_url: imageUrl(m.cover), bedtime_ok: !!m.bedtime_ok, sort_order: m.sort_order }));
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
}
