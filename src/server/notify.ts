// Notifications without spam. The inbox is always live; only the *notification* is batched:
// the first message after a quiet spell goes out right away, everything else for that person in
// the next N minutes (default 10) arrives as one update. Repeats collapse (×N). 💭 face taps only
// ride along (on their own they wait at least an hour). Urgent / panic are never held back.
// Delivered as a `notify` event over the live connection; push notifications will reuse this queue.
import type { Db } from './db.ts';
import type { EventHub } from './events.ts';
import { inWindow, minutesOfDay } from '../shared/time.ts';
import type { NotifyBatch, NotifyPrefs } from '../shared/types.ts';

type Kind = NotifyBatch['lines'][number]['kind'];
interface QueueRow { id: number; user_id: number; kind: Kind; message_id: number | null; summary: string; created_at: string }

const FACE_ONLY_MIN = 60;

export function prefsFor(db: Db, userId: number): NotifyPrefs {
  const r = db.get<{ batch_min: number; face_taps: number }>('SELECT batch_min, face_taps FROM notify_prefs WHERE user_id = ?', userId);
  return { batch_min: r?.batch_min ?? 10, face_taps: r ? !!r.face_taps : true };
}

function quiet(db: Db, now: Date) {
  const q = db.setting<{ start_min: number; end_min: number }>('quiet_hours', { start_min: 1260, end_min: 420 });
  return inWindow(minutesOfDay(now), q.start_min, q.end_min);
}

const lastDelivery = (db: Db, userId: number) => {
  const r = db.get<{ at: string | null }>('SELECT MAX(delivered_at) AS at FROM notify_queue WHERE user_id = ?', userId);
  return r?.at ? new Date(r.at) : null;
};

/** Queues a notification for one person, and delivers now if their window allows it. */
export function enqueue(db: Db, hub: EventHub, now: Date, userId: number, kind: Kind, summary: string, ref: { messageId?: number; momentId?: number } = {}) {
  const prefs = prefsFor(db, userId);
  if (kind === 'face' && !prefs.face_taps) return;
  db.run('INSERT INTO notify_queue(user_id, kind, message_id, moment_id, summary, created_at) VALUES(?,?,?,?,?,?)',
    userId, kind, ref.messageId ?? null, ref.momentId ?? null, summary, now.toISOString());
  if (kind === 'urgent' || kind === 'panic') return deliver(db, hub, now, userId);
  if (kind === 'face' || quiet(db, now)) return null; // face taps ride along; nothing buzzes at night
  const last = lastDelivery(db, userId);
  if (prefs.batch_min === 0 || !last || now.getTime() - last.getTime() >= prefs.batch_min * 60_000) return deliver(db, hub, now, userId);
  return null;
}

/** Sends everything waiting for this person as one update. */
export function deliver(db: Db, hub: EventHub, now: Date, userId: number): NotifyBatch | null {
  const rows = db.all<QueueRow>('SELECT * FROM notify_queue WHERE user_id = ? AND delivered_at IS NULL ORDER BY id', userId);
  if (!rows.length) return null;
  const batchId = rows[0].id;
  db.run('UPDATE notify_queue SET delivered_at = ?, batch_id = ? WHERE user_id = ? AND delivered_at IS NULL', now.toISOString(), batchId, userId);
  const lines: NotifyBatch['lines'] = [];
  for (const r of rows) {
    const same = lines.find((l) => l.kind === r.kind && l.summary === r.summary);
    if (same) same.count += 1;
    else lines.push({ kind: r.kind, summary: r.summary, count: 1, message_id: r.message_id });
  }
  // urgent first, then in order
  lines.sort((a, b) => Number(b.kind === 'urgent' || b.kind === 'panic') - Number(a.kind === 'urgent' || a.kind === 'panic'));
  const batch: NotifyBatch = { id: batchId, at: now.toISOString(), lines, total: rows.length };
  hub.publish([userId], { type: 'notify', batch });
  return batch;
}

/** Background job (every 15 s): deliver held updates whose window has passed. */
export function flushNotifications(db: Db, hub: EventHub, now: Date) {
  if (quiet(db, now)) return;
  const users = db.all<{ user_id: number; faces_only: number; oldest: string }>(
    "SELECT user_id, MIN(kind = 'face') AS faces_only, MIN(created_at) AS oldest FROM notify_queue WHERE delivered_at IS NULL GROUP BY user_id",
  );
  for (const u of users) {
    const window = prefsFor(db, u.user_id).batch_min * 60_000;
    const last = lastDelivery(db, u.user_id);
    const windowPassed = !last || now.getTime() - last.getTime() >= window;
    // 💭 on their own never buzz right away: they wait an hour, in case a real message comes to carry them.
    const facesReady = !u.faces_only || now.getTime() - new Date(u.oldest).getTime() >= FACE_ONLY_MIN * 60_000;
    if (windowPassed && facesReady) deliver(db, hub, now, u.user_id);
  }
}
