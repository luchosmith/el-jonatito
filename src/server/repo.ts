// Read models shared by routes and the dispatcher.
import type { Db } from './db.ts';
import type { BoardSymbol, LogEntry, Message, Person, Reply, Token } from '../shared/types.ts';

export const imageUrl = (file: string | null) => (file ? `/api/images/${encodeURIComponent(file)}` : null);
export const audioUrl = (file: string | null) => (file ? `/api/audio/${encodeURIComponent(file)}` : null);

interface PersonRow {
  id: string; kind: 'person' | 'pet'; display_name: string; short_label: string; relation: string | null;
  role: Person['role']; is_self: number; is_visible: number; sort_order: number; species: string | null;
  breed: string | null; emoji: string | null; photo: string | null; user_id: number | null;
  status: Person['status']; status_until: string | null;
}

const PERSON_SQL = `
  SELECT p.*, u.id AS user_id, a.status AS status, a.until AS status_until,
    (SELECT file FROM images i WHERE i.owner_type='person' AND i.owner_id=p.id AND i.is_active=1 ORDER BY i.id DESC LIMIT 1) AS photo
  FROM people p
  LEFT JOIN users u ON u.person_id = p.id
  LEFT JOIN availability a ON a.user_id = u.id`;

function toPerson(r: PersonRow): Person {
  return {
    id: r.id, kind: r.kind, display_name: r.display_name, short_label: r.short_label, relation: r.relation,
    role: r.role, is_self: !!r.is_self, is_visible: !!r.is_visible, sort_order: r.sort_order,
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

interface SymbolRow {
  id: string; category: string; kind: BoardSymbol['kind']; emoji: string; label_en: string; label_es: string;
  grid_page: string; grid_row: number; grid_col: number; is_hidden: number; badge_color: string | null;
  log_trackable: number; photo: string | null;
}

export function listSymbols(db: Db): BoardSymbol[] {
  return db
    .all<SymbolRow>(
      `SELECT s.*, (SELECT file FROM images i WHERE i.owner_type='symbol' AND i.owner_id=s.id AND i.is_active=1 ORDER BY i.id DESC LIMIT 1) AS photo
       FROM symbols s ORDER BY grid_page, grid_row, grid_col`,
    )
    .map((r) => ({
      id: r.id, category: r.category, kind: r.kind, emoji: r.emoji, labels: { en: r.label_en, es: r.label_es },
      grid_page: r.grid_page, grid_row: r.grid_row, grid_col: r.grid_col, is_hidden: !!r.is_hidden,
      badge_color: r.badge_color, photo_url: imageUrl(r.photo), log_trackable: !!r.log_trackable,
    }));
}

interface MessageRow {
  id: number; from_user_id: number; to_person_id: string | null; tokens: string; sentence_en: string;
  sentence_es: string; priority: 'normal' | 'urgent'; audio_file: string | null; created_at: string;
}
interface ReplyRow {
  id: number; message_id: number; from_user_id: number; from_person_id: string | null; kind: Reply['kind'];
  eta_at: string | null; audio_file: string | null; created_at: string;
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

export function logsBetween(db: Db, fromIso: string, toIso: string): LogEntry[] {
  return db.all<LogEntry>(
    `SELECT l.*, COALESCE(p.short_label, u.username) AS entered_by_name
     FROM log_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN people p ON p.id = u.person_id
     WHERE l.at >= ? AND l.at < ? ORDER BY l.at`,
    fromIso, toIso,
  );
}

export function getLog(db: Db, id: number): LogEntry | undefined {
  return db.get<LogEntry>(
    `SELECT l.*, COALESCE(p.short_label, u.username) AS entered_by_name
     FROM log_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN people p ON p.id = u.person_id WHERE l.id = ?`,
    id,
  );
}

export function childUserIds(db: Db): number[] {
  return db.all<{ id: number }>("SELECT id FROM users WHERE role = 'child'").map((r) => r.id);
}

export function audit(db: Db, userId: number | null, action: string, target: string | null, at: string) {
  db.run('INSERT INTO audit(user_id, action, target, at) VALUES(?,?,?,?)', userId, action, target, at);
}
