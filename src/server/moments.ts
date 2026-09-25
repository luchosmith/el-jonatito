// Everything he taps, grouped into moments (one intent each). A moment ends at Send (sent), Clear
// (cleared) or after a quiet spell (not sent). An unsent moment that included someone's face is
// passed to that person as a 💭, through the batched notification queue.
import type { Db } from './db.ts';
import type { EventHub } from './events.ts';
import { enqueue } from './notify.ts';
import { imageUrl } from './repo.ts';
import { renderSentence, type ResolvedToken } from '../shared/grammar.ts';
import type { LoggedTap, Moment, MomentChip, TapInput, Token, TokenKind } from '../shared/types.ts';

export const TAP_ACTIONS: LoggedTap[] = ['add', 'open', 'closed', 'person', 'hear', 'talk', 'social', 'body', 'pain', 'media', 'send', 'clear', 'say'];

interface MomentRow {
  id: number; started_at: string; last_at: string; ended_at: string | null; outcome: Moment['outcome'];
  tokens: string; sentence_en: string | null; sentence_es: string | null; message_id: number | null;
  answered_by: number | null; notified: string;
}
interface TapRow { id: number; at: string; moment_id: number; item_id: string | null; person_id: string | null; action: LoggedTap; screen: string; detail: string | null }
interface Pic { id: string; kind: string; category: string; emoji: string | null; label: string; label_en: string; label_es: string; photo: string | null; is_self: number | null; person_kind: string | null }

export const momentIdleMs = (db: Db) => db.setting<number>('moment_idle_s', 30) * 1000;

function pics(db: Db): Map<string, Pic> {
  const rows = db.all<Pic>(
    `SELECT i.id, i.kind, i.category, i.emoji, COALESCE(i.short_label, i.label_en) AS label, i.label_en, i.label_es,
       (SELECT file FROM images im WHERE im.owner_type='item' AND im.owner_id=i.id AND im.is_active=1 ORDER BY im.id DESC LIMIT 1) AS photo,
       p.is_self, p.kind AS person_kind
     FROM items i LEFT JOIN people p ON p.id = i.id`,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** The sentence the strip would have made, in both languages. */
export function sentenceFor(db: Db, tokens: Token[], cache = pics(db)): { en: string | null; es: string | null } {
  const resolved: ResolvedToken[] = [];
  for (const t of tokens) {
    const p = cache.get(t.id);
    if (!p || p.is_self) continue;
    resolved.push({ kind: t.kind, en: p.label_en, es: p.label_es });
  }
  if (!resolved.length) return { en: null, es: null };
  return { en: renderSentence(resolved, 'en'), es: renderSentence(resolved, 'es') };
}

const openMoment = (db: Db) => db.get<MomentRow>("SELECT * FROM moments WHERE outcome = 'open' ORDER BY id DESC LIMIT 1");
const caretakerIds = (db: Db) => db.all<{ id: number }>("SELECT id FROM users WHERE role = 'caretaker'").map((r) => r.id);

/** Stores a batch of taps from the tablet and groups them into moments. */
export function recordTaps(db: Db, hub: EventHub, now: Date, taps: TapInput[]) {
  const cache = pics(db);
  const idle = momentIdleMs(db);
  const sorted = [...taps].sort((a, b) => a.at.localeCompare(b.at));
  for (const t of sorted) {
    let m = openMoment(db);
    if (m && new Date(t.at).getTime() - new Date(m.last_at).getTime() > idle) {
      closeMoment(db, hub, now, m.id, 'not_sent');
      m = undefined;
    }
    if (!m) {
      const r = db.run('INSERT INTO moments(started_at, last_at) VALUES(?, ?)', t.at, t.at);
      m = db.get<MomentRow>('SELECT * FROM moments WHERE id = ?', r.lastId)!;
    }
    db.run('INSERT INTO tap_events(at, moment_id, item_id, person_id, action, screen, detail) VALUES(?,?,?,?,?,?,?)',
      t.at, m.id, t.item_id ?? null, t.person_id ?? null, t.action, t.screen, t.detail ? JSON.stringify(t.detail) : null);

    const tokens = JSON.parse(m.tokens) as Token[];
    if (t.action === 'add') {
      const id = t.person_id ?? t.item_id;
      const p = id ? cache.get(id) : undefined;
      if (p && !p.is_self && tokens.length < 8) tokens.push({ kind: (p.person_kind ?? p.kind) as TokenKind, id: p.id });
    }
    db.run('UPDATE moments SET last_at = ?, tokens = ? WHERE id = ?', t.at > m.last_at ? t.at : m.last_at, JSON.stringify(tokens), m.id);
    if (t.action === 'clear') closeMoment(db, hub, now, m.id, 'cleared');
  }
  hub.publish(caretakerIds(db), { type: 'timeline' });
}

/** Ends a moment. Unsent moments that touched someone's face go to that person (batched). */
export function closeMoment(db: Db, hub: EventHub, now: Date, id: number, outcome: Exclude<Moment['outcome'], 'open'>, messageId: number | null = null) {
  const m = db.get<MomentRow>('SELECT * FROM moments WHERE id = ?', id);
  if (!m || m.outcome !== 'open') return;
  const tokens = JSON.parse(m.tokens) as Token[];
  const s = sentenceFor(db, tokens);
  let notified: string[] = [];
  if (outcome === 'not_sent') {
    const faces = new Set<string>();
    for (const t of tokens) if (t.kind === 'person') faces.add(t.id);
    for (const r of db.all<{ person_id: string }>("SELECT person_id FROM tap_events WHERE moment_id = ? AND action = 'person' AND person_id IS NOT NULL", id)) faces.add(r.person_id);
    for (const pid of faces) {
      const u = db.get<{ id: number; is_self: number; kind: string }>(
        'SELECT u.id, p.is_self, p.kind FROM users u JOIN people p ON p.id = u.person_id WHERE u.person_id = ?', pid,
      );
      if (!u || u.is_self || u.kind !== 'person') continue;
      notified.push(pid);
      enqueue(db, hub, now, u.id, 'face', s.en ? `💭 “${s.en}”` : '💭 tapped your face', { momentId: id });
    }
  }
  db.run(
    'UPDATE moments SET outcome = ?, ended_at = ?, sentence_en = ?, sentence_es = ?, message_id = COALESCE(?, message_id), notified = ? WHERE id = ?',
    outcome, outcome === 'sent' ? now.toISOString() : m.last_at, s.en, s.es, messageId, JSON.stringify(notified), id,
  );
  hub.publish(caretakerIds(db), { type: 'timeline' });
}

/** A message just went out: the moment that built it is sent. */
export function momentSent(db: Db, hub: EventHub, now: Date, messageId: number) {
  const m = openMoment(db);
  if (m && now.getTime() - new Date(m.last_at).getTime() <= momentIdleMs(db) * 2) closeMoment(db, hub, now, m.id, 'sent', messageId);
}

/** Background job: moments with no taps for a while end as "not sent". */
export function closeStaleMoments(db: Db, hub: EventHub, now: Date) {
  const cutoff = new Date(now.getTime() - momentIdleMs(db)).toISOString();
  for (const m of db.all<{ id: number }>("SELECT id FROM moments WHERE outcome = 'open' AND last_at < ?", cutoff)) closeMoment(db, hub, now, m.id, 'not_sent');
}

/** Moments with their pictures, for the timelines. */
export function listMoments(db: Db, fromIso: string, toIso: string): Moment[] {
  const cache = pics(db);
  const rows = db.all<MomentRow>('SELECT * FROM moments WHERE started_at >= ? AND started_at < ? ORDER BY started_at DESC', fromIso, toIso);
  if (!rows.length) return [];
  const taps = db.all<TapRow>(`SELECT * FROM tap_events WHERE moment_id IN (${rows.map(() => '?').join(',')}) ORDER BY at, id`, ...rows.map((r) => r.id));
  const sentTo = (messageId: number | null) =>
    messageId
      ? db.all<{ person_id: string }>('SELECT u.person_id FROM message_recipients r JOIN users u ON u.id = r.user_id WHERE r.message_id = ? AND u.person_id IS NOT NULL', messageId).map((r) => r.person_id)
      : [];
  return rows.map((m) => ({
    id: m.id, started_at: m.started_at, ended_at: m.ended_at, outcome: m.outcome,
    chips: taps.filter((t) => t.moment_id === m.id && !['send', 'clear', 'say'].includes(t.action)).map((t) => chip(t, cache)),
    sentence_en: m.sentence_en, sentence_es: m.sentence_es, message_id: m.message_id, sent_to: sentTo(m.message_id),
    notified: JSON.parse(m.notified) as string[],
    answered_by: m.answered_by ? db.get<{ n: string }>('SELECT COALESCE(i.short_label, u.username) AS n FROM users u LEFT JOIN items i ON i.id = u.person_id WHERE u.id = ?', m.answered_by)?.n ?? null : null,
  }));
}

function chip(t: TapRow, cache: Map<string, Pic>): MomentChip {
  const id = t.person_id ?? t.item_id;
  const p = id ? cache.get(id) : undefined;
  const detail = t.detail ? (JSON.parse(t.detail) as Record<string, unknown>) : {};
  return {
    at: t.at, action: t.action, id: id ?? null,
    kind: p ? ((p.category === 'body' ? 'body' : p.person_kind ?? p.kind) as MomentChip['kind']) : null,
    label: p?.label ?? (t.action === 'pain' ? `pain ${detail.level ?? ''}`.trim() : t.action),
    emoji: p?.emoji ?? ({ hear: '〰️', talk: '👂', pain: '🩹', media: '🎬', say: '🔊' } as Record<string, string>)[t.action] ?? null,
    photo_url: imageUrl(p?.photo ?? null),
    closed_until: typeof detail.closed_until === 'string' ? detail.closed_until : null,
  };
}
