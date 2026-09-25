// Read models shared by routes and the dispatcher.
import type { Db } from './db.ts';
import type {
  BoardSymbol, Item, ItemImage, ItemRule, LogEntry, Message, Person, PersonLocation, Reply, Token, VoiceNote,
} from '../shared/types.ts';
import { evaluateRules } from '../shared/rules.ts';

export const imageUrl = (file: string | null) => (file ? `/api/images/${encodeURIComponent(file)}` : null);
export const audioUrl = (file: string | null) => (file ? `/api/audio/${encodeURIComponent(file)}` : null);

const PHOTO = (owner: string) =>
  `(SELECT file FROM images im WHERE im.owner_type='item' AND im.owner_id=${owner} AND im.is_active=1 ORDER BY im.id DESC LIMIT 1)`;
const AUDIO = (owner: string, lang: string) =>
  `(SELECT file FROM audio_clips ac WHERE ac.owner_type='item' AND ac.owner_id=${owner} AND ac.lang='${lang}' AND ac.is_active=1 ORDER BY ac.id DESC LIMIT 1)`;

// ---- People ----------------------------------------------------------------------------------

interface PersonRow {
  id: string; kind: 'person' | 'pet'; display_name: string; short_label: string; relation: string | null;
  role: Person['role']; is_self: number; is_hidden: number; sort_order: number; species: string | null;
  breed: string | null; emoji: string | null; photo: string | null; user_id: number | null;
  status: Person['status']; status_until: string | null;
}

const PERSON_SQL = `
  SELECT p.id, p.kind, p.display_name, p.relation, p.role, p.is_self, p.sort_order, p.species, p.breed,
    COALESCE(i.short_label, i.label_en) AS short_label, i.emoji, i.is_hidden, ${PHOTO('p.id')} AS photo,
    u.id AS user_id, a.status AS status, a.until AS status_until
  FROM people p
  JOIN items i ON i.id = p.id
  LEFT JOIN users u ON u.person_id = p.id
  LEFT JOIN availability a ON a.user_id = u.id`;

function toPerson(r: PersonRow): Person {
  return {
    id: r.id, kind: r.kind, display_name: r.display_name, short_label: r.short_label, relation: r.relation,
    role: r.role, is_self: !!r.is_self, is_visible: !r.is_hidden, sort_order: r.sort_order,
    species: r.species, breed: r.breed, emoji: r.emoji, photo_url: imageUrl(r.photo), user_id: r.user_id,
    status: r.status ?? null, status_until: r.status_until,
  };
}

export function listPeople(db: Db): Person[] {
  return db.all<PersonRow>(`${PERSON_SQL} ORDER BY p.sort_order`).map(toPerson);
}

export function getPerson(db: Db, id: string): Person | undefined {
  const r = db.get<PersonRow>(`${PERSON_SQL} WHERE p.id = ?`, id);
  return r ? toPerson(r) : undefined;
}

// ---- Items (the catalog) ---------------------------------------------------------------------

interface ItemRow {
  id: string; category: Item['category']; kind: Item['kind']; label_en: string; label_es: string; short_label: string | null;
  emoji: string | null; tap: Item['tap']; parent_id: string | null; orbit: Item['orbit']; orbit_slot: number | null;
  grid_page: string | null; grid_row: number | null; grid_col: number | null; user_id: number | null; media_id: number | null;
  badge_color: string | null; log_trackable: number; alias_of: string | null; is_hidden: number;
  photo: string | null; audio_en: string | null; audio_es: string | null;
}
interface RuleRow extends Omit<ItemRule, 'blocks'> { blocks: number }

const ITEM_SQL = `SELECT i.*, ${PHOTO('i.id')} AS photo, ${AUDIO('i.id', 'en')} AS audio_en, ${AUDIO('i.id', 'es')} AS audio_es FROM items i`;

export function listRules(db: Db, itemId?: string): ItemRule[] {
  const rows = itemId
    ? db.all<RuleRow>('SELECT * FROM item_rules WHERE item_id = ? ORDER BY id', itemId)
    : db.all<RuleRow>('SELECT * FROM item_rules ORDER BY id');
  return rows.map((r) => ({ ...r, blocks: !!r.blocks }));
}

/** Minute of the day when "tomorrow" begins for daily limits: the first routine item (wake-up). */
function dayStartMin(db: Db): number {
  return db.get<{ m: number | null }>('SELECT MIN(start_min) AS m FROM schedule_items')?.m ?? 420;
}

/** Log times for an item and every alias of it (water on Food = water on Drinks). */
export function logTimesFor(db: Db, itemId: string, sinceIso: string): Date[] {
  const canon = db.get<{ alias_of: string | null }>('SELECT alias_of FROM items WHERE id = ?', itemId)?.alias_of ?? itemId;
  return db
    .all<{ at: string }>(
      `SELECT l.at FROM log_entries l WHERE l.at >= ? AND l.symbol_id IN (SELECT id FROM items WHERE id = ? OR alias_of = ?)`,
      sinceIso, canon, canon,
    )
    .map((r) => new Date(r.at));
}

function toItem(r: ItemRow, rules: ItemRule[], closed: { closed_until: Date | null; closed_by: ItemRule['kind'] | null }): Item {
  return {
    id: r.id, category: r.category, kind: r.kind, labels: { en: r.label_en, es: r.label_es }, short_label: r.short_label,
    emoji: r.emoji, tap: r.tap, parent_id: r.parent_id, orbit: r.orbit, orbit_slot: r.orbit_slot,
    grid_page: r.grid_page, grid_row: r.grid_row, grid_col: r.grid_col, user_id: r.user_id, media_id: r.media_id,
    badge_color: r.badge_color, log_trackable: !!r.log_trackable, alias_of: r.alias_of, is_hidden: !!r.is_hidden,
    photo_url: imageUrl(r.photo), audio: { en: audioUrl(r.audio_en), es: audioUrl(r.audio_es) }, rules,
    closed_until: closed.closed_until?.toISOString() ?? null, closed_by: closed.closed_by,
  };
}

export function listItems(db: Db, now: Date): Item[] {
  const rules = listRules(db);
  const byItem = new Map<string, ItemRule[]>();
  for (const r of rules) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  const routine = new Map(db.all<{ id: number; start_min: number }>('SELECT id, start_min FROM schedule_items').map((s) => [s.id, s.start_min]));
  const start = dayStartMin(db);
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  return db.all<ItemRow>(`${ITEM_SQL} ORDER BY i.id`).map((r) => {
    const own = byItem.get(r.id) ?? [];
    const closed = own.some((x) => x.blocks)
      ? evaluateRules(own, { now, logs: logTimesFor(db, r.id, since), routine, dayStartMin: start })
      : { closed_until: null, closed_by: null };
    return toItem(r, own, closed);
  });
}

export function getItem(db: Db, id: string, now: Date): Item | undefined {
  return listItems(db, now).find((i) => i.id === id);
}

/** The picture-board view of the catalog (every word with a fixed grid cell). */
export function listSymbols(db: Db): BoardSymbol[] {
  return db
    .all<ItemRow>(`${ITEM_SQL} WHERE i.grid_page IS NOT NULL AND i.category NOT IN ('person','pet','body') ORDER BY grid_page, grid_row, grid_col`)
    .map((r) => ({
      id: r.id, category: r.category, kind: r.kind, emoji: r.emoji ?? '•', labels: { en: r.label_en, es: r.label_es },
      grid_page: r.grid_page!, grid_row: r.grid_row!, grid_col: r.grid_col!, is_hidden: !!r.is_hidden,
      badge_color: r.badge_color, photo_url: imageUrl(r.photo), log_trackable: !!r.log_trackable,
    }));
}

export function itemImages(db: Db, id: string): ItemImage[] {
  return db
    .all<{ id: number; file: string; is_active: number; created_at: string }>(
      "SELECT id, file, is_active, created_at FROM images WHERE owner_type='item' AND owner_id = ? ORDER BY id DESC", id,
    )
    .map((r) => ({ id: r.id, url: imageUrl(r.file)!, is_active: !!r.is_active, created_at: r.created_at }));
}

// ---- Messages ----------------------------------------------------------------------------------

interface MessageRow {
  id: number; from_user_id: number; to_person_id: string | null; tokens: string; sentence_en: string;
  sentence_es: string; priority: 'normal' | 'urgent'; audio_file: string | null; created_at: string;
}
interface ReplyRow {
  id: number; message_id: number; from_user_id: number; from_person_id: string | null; kind: Reply['kind'];
  eta_at: string | null; audio_file: string | null; text: string | null; created_at: string;
}

function repliesFor(db: Db, messageId: number): Reply[] {
  return db
    .all<ReplyRow>(
      `SELECT r.*, u.person_id AS from_person_id FROM replies r JOIN users u ON u.id = r.from_user_id
       WHERE r.message_id = ? ORDER BY r.id`,
      messageId,
    )
    .map((r) => ({ ...r, audio_url: audioUrl(r.audio_file) }));
}

function toMessage(db: Db, r: MessageRow): Message {
  return {
    id: r.id, from_user_id: r.from_user_id, to_person_id: r.to_person_id, tokens: JSON.parse(r.tokens) as Token[],
    sentence_en: r.sentence_en, sentence_es: r.sentence_es, priority: r.priority, audio_url: audioUrl(r.audio_file),
    created_at: r.created_at,
    recipients: db.all<{ user_id: number }>('SELECT user_id FROM message_recipients WHERE message_id = ?', r.id).map((x) => x.user_id),
    replies: repliesFor(db, r.id),
    pain: db.get<{ part: string; side: string | null; level: number }>(
      'SELECT body_part AS part, side, level FROM pain_reports WHERE message_id = ?', r.id,
    ) ?? null,
  };
}

export function getMessage(db: Db, id: number): Message | undefined {
  const r = db.get<MessageRow>('SELECT * FROM messages WHERE id = ?', id);
  return r ? toMessage(db, r) : undefined;
}

export function inboxFor(db: Db, userId: number, limit = 50): Message[] {
  return db
    .all<MessageRow>(
      `SELECT m.* FROM messages m JOIN message_recipients mr ON mr.message_id = m.id
       WHERE mr.user_id = ? ORDER BY m.id DESC LIMIT ?`,
      userId, limit,
    )
    .map((r) => toMessage(db, r));
}

export function sentBy(db: Db, userId: number, limit = 50): Message[] {
  return db
    .all<MessageRow>('SELECT * FROM messages WHERE from_user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)
    .map((r) => toMessage(db, r));
}

export function getReply(db: Db, id: number): Reply | undefined {
  const r = db.get<ReplyRow>(
    'SELECT r.*, u.person_id AS from_person_id FROM replies r JOIN users u ON u.id = r.from_user_id WHERE r.id = ?', id,
  );
  return r ? { ...r, audio_url: audioUrl(r.audio_file) } : undefined;
}

// ---- Voice notes & locations ----------------------------------------------------------------------

interface VoiceRow {
  id: number; from_user_id: number; from_person_id: string | null; audio_file: string; duration_s: number | null;
  created_at: string; heard_at: string | null; pinned: number; hidden: number; source: VoiceNote['source'];
}

const toVoice = (r: VoiceRow): VoiceNote => ({
  id: r.id, from_user_id: r.from_user_id, from_person_id: r.from_person_id, audio_url: audioUrl(r.audio_file)!,
  duration_s: r.duration_s, created_at: r.created_at, heard_at: r.heard_at, pinned: !!r.pinned, hidden: !!r.hidden, source: r.source,
});

const VOICE_SQL = 'SELECT v.*, u.person_id AS from_person_id FROM voice_notes v JOIN users u ON u.id = v.from_user_id';

/** Pinned first, then newest. Unpinned notes older than the retention period are left out. */
export function listVoiceNotes(db: Db, now: Date, opts: { includeHidden?: boolean; fromUserId?: number } = {}): VoiceNote[] {
  const days = db.setting<number>('voice_retention_days', 90);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const where = ['(v.pinned = 1 OR v.created_at >= ?)'];
  const params: (string | number)[] = [cutoff];
  if (!opts.includeHidden) where.push('v.hidden = 0');
  if (opts.fromUserId) {
    where.push('v.from_user_id = ?');
    params.push(opts.fromUserId);
  }
  return db.all<VoiceRow>(`${VOICE_SQL} WHERE ${where.join(' AND ')} ORDER BY v.pinned DESC, v.created_at DESC, v.id DESC LIMIT 300`, ...params).map(toVoice);
}

export function getVoiceNote(db: Db, id: number): VoiceNote | undefined {
  const r = db.get<VoiceRow>(`${VOICE_SQL} WHERE v.id = ?`, id);
  return r ? toVoice(r) : undefined;
}

export function listLocations(db: Db, now: Date): PersonLocation[] {
  return db
    .all<PersonLocation & { person_id: string | null }>(
      `SELECT u.person_id, l.place_label, l.country_code, l.tz, l.lat, l.lon, l.source, l.until, l.updated_at
       FROM locations l JOIN users u ON u.id = l.user_id WHERE u.person_id IS NOT NULL AND (l.until IS NULL OR l.until > ?)`,
      now.toISOString(),
    )
    .map((r) => ({ ...r, person_id: r.person_id! }));
}

// ---- Log -----------------------------------------------------------------------------------------

export function logsBetween(db: Db, fromIso: string, toIso: string): LogEntry[] {
  return db.all<LogEntry>(
    `SELECT l.*, COALESCE(i.short_label, i.label_en, u.username) AS entered_by_name
     FROM log_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN items i ON i.id = u.person_id
     WHERE l.at >= ? AND l.at < ? ORDER BY l.at`,
    fromIso, toIso,
  );
}

export function getLog(db: Db, id: number): LogEntry | undefined {
  return db.get<LogEntry>(
    `SELECT l.*, COALESCE(i.short_label, i.label_en, u.username) AS entered_by_name
     FROM log_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN items i ON i.id = u.person_id WHERE l.id = ?`,
    id,
  );
}

export function childUserIds(db: Db): number[] {
  return db.all<{ id: number }>("SELECT id FROM users WHERE role = 'child'").map((r) => r.id);
}

export function audit(db: Db, userId: number | null, action: string, target: string | null, at: string) {
  db.run('INSERT INTO audit(user_id, action, target, at) VALUES(?,?,?,?)', userId, action, target, at);
}
