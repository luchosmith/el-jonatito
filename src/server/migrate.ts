// Upgrades an older database in place.
// v2 -> v3: `symbols` and the display fields of `people` become `items`; `limits` become `item_rules`;
// pictures move to owner_type 'item'; voice replies are copied into `voice_notes`.
// v3 -> v4: adds the Music item (headphones + sound wave) to the inner orbit.
// v4 -> v5: typed replies (replies.text), event pictures (images.owner_type 'event'); the tap log,
//           moments, notification queue and calendar tables come from schema.sql.
// v5 -> v6: voice_notes.label (saved clips a caretaker can send again).
// v6 -> v7: Pongo and Barney move from the orbit into the dock (settings.dock_items).
// v7 -> v8: people leave the outer orbit (they are in the taskbar and on the globe).
// v8 -> v9: blocks of time: schedule_items.end_min / .big and events.ends_at. Sleep runs until wake-up;
//           the morning is a chain of big pictures (wake-up = bath photo, breakfast = smoothie); school
//           leaves the routine for now.
// v9 -> v10: availability.status can be 'on_duty' (a caretaker who is with him).
// A full copy of the old database is written next to it first (jonatito.sqlite.v<N>-backup-<time>).
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import type { Config } from './config.ts';
import { applyDock, applyOrbitDefaults, copySeedImage, insertLimitRules, PAGE_CATEGORY } from './orbit.ts';

export const SCHEMA_VERSION = 10;

const tableExists = (db: Db, name: string) => !!db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name);

export function schemaVersion(db: Db): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')!.user_version;
}

/** Returns the backup file when a migration ran, null when the database was already current. */
export function migrate(db: Db, cfg: Config): string | null {
  const isV2 = tableExists(db, 'symbols');
  const from = isV2 ? 2 : schemaVersion(db);
  if (from >= SCHEMA_VERSION) return null;
  if (from === 0) return null; // a new, empty database: seed() creates the current version

  const backup = cfg.dbFile === ':memory:' ? null : `${cfg.dbFile}.v${from}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (backup) {
    if (fs.existsSync(backup)) fs.rmSync(backup);
    db.raw.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  }

  if (from < 3) {
    db.raw.exec('PRAGMA foreign_keys = OFF');
    try {
      db.tx(() => migrateV2toV3(db, cfg));
    } finally {
      db.raw.exec('PRAGMA foreign_keys = ON');
    }
  }
  if (from < 4) db.tx(() => migrateV3toV4(db, cfg));
  if (from < 5) {
    db.raw.exec('PRAGMA foreign_keys = OFF');
    try {
      db.tx(() => migrateV4toV5(db));
    } finally {
      db.raw.exec('PRAGMA foreign_keys = ON');
    }
  }
  if (from < 6) db.tx(() => migrateV5toV6(db));
  if (from < 7) db.tx(() => migrateV6toV7(db));
  if (from < 8) db.tx(() => db.run("UPDATE items SET orbit = NULL, orbit_slot = NULL WHERE orbit = 'outer'"));
  if (from < 9) db.tx(() => migrateV8toV9(db));
  if (from < 10) db.tx(() => migrateV9toV10(db));
  db.raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return backup ?? ':memory:';
}

const columns = (db: Db, table: string) => db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

/** v10: SQLite can't relax a CHECK in place, so availability is rebuilt to allow 'on_duty'. */
function migrateV9toV10(db: Db) {
  db.raw.exec(`
    CREATE TABLE availability_v10 (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('available','busy','away','on_duty')),
      until TEXT, updated_at TEXT NOT NULL);
    INSERT INTO availability_v10 SELECT user_id, status, until, updated_at FROM availability;
    DROP TABLE availability;
    ALTER TABLE availability_v10 RENAME TO availability;`);
}

/** v9: blocks of time, and the new morning. Only changes routine rows that are still the seed's. */
function migrateV8toV9(db: Db) {
  const sc = columns(db, 'schedule_items');
  if (!sc.includes('end_min')) db.raw.exec('ALTER TABLE schedule_items ADD COLUMN end_min INTEGER');
  if (!sc.includes('big')) db.raw.exec('ALTER TABLE schedule_items ADD COLUMN big INTEGER NOT NULL DEFAULT 0');
  if (!columns(db, 'events').includes('ends_at')) db.raw.exec('ALTER TABLE events ADD COLUMN ends_at TEXT');
  const has = (id: string) => !!db.get('SELECT 1 FROM items WHERE id = ?', id);
  const wake = db.get<{ m: number | null }>("SELECT MIN(start_min) AS m FROM schedule_items WHERE symbol_id IS NOT 'bed'")?.m ?? 420;
  db.run("UPDATE schedule_items SET end_min = ?, big = 1 WHERE symbol_id = 'bed' AND end_min IS NULL", wake);
  if (has('bath')) db.run("UPDATE schedule_items SET symbol_id = 'bath', big = 1 WHERE label = 'wake' AND symbol_id IS NULL");
  if (has('smoothie')) db.run("UPDATE schedule_items SET symbol_id = 'smoothie', emoji = '🥤', big = 1 WHERE label = 'breakfast' AND symbol_id = 'pancakes'");
  db.run("DELETE FROM schedule_items WHERE label = 'school' AND start_min = 510 AND symbol_id IS NULL AND NOT EXISTS (SELECT 1 FROM item_rules WHERE routine_item_id = schedule_items.id)");
}

/** v7: the dock holds Pongo and Barney (after the family); their orbit spots stay empty. */
function migrateV6toV7(db: Db) {
  applyDock(db, [{ id: 'pongo' }, { id: 'barney' }], () => null);
}

/** v6: saved clips have a label. */
function migrateV5toV6(db: Db) {
  const cols = db.all<{ name: string }>('PRAGMA table_info(voice_notes)').map((c) => c.name);
  if (!cols.includes('label')) db.raw.exec('ALTER TABLE voice_notes ADD COLUMN label TEXT');
}

/** v5: SQLite can't relax a CHECK in place, so images and replies are rebuilt with the new values. */
function migrateV4toV5(db: Db) {
  db.raw.exec(`
    CREATE TABLE images_v5 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('item','media','event')),
      owner_id TEXT NOT NULL, file TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
    INSERT INTO images_v5 SELECT id, owner_type, owner_id, file, is_active, uploaded_by, created_at FROM images;
    DROP TABLE images;
    ALTER TABLE images_v5 RENAME TO images;
    CREATE INDEX images_owner ON images(owner_type, owner_id, is_active);

    CREATE TABLE replies_v5 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK (kind IN ('yes','wait','no','coming','voice','text')),
      eta_at TEXT, audio_file TEXT, text TEXT, created_at TEXT NOT NULL);
    INSERT INTO replies_v5(id, message_id, from_user_id, kind, eta_at, audio_file, created_at)
      SELECT id, message_id, from_user_id, kind, eta_at, audio_file, created_at FROM replies;
    DROP TABLE replies;
    ALTER TABLE replies_v5 RENAME TO replies;`);
  const broken = db.all<{ table: string }>('PRAGMA foreign_key_check');
  if (broken.length) throw new Error(`Migration left ${broken.length} broken links (first in ${broken[0].table}); nothing was changed`);
}

/** v4: the Music item. Takes inner slot 7 (index 6) if free, else the first free one; a caretaker can move it. */
function migrateV3toV4(db: Db, cfg: Config) {
  if (db.get("SELECT 1 FROM items WHERE id = 'music'")) return;
  const vocab = JSON.parse(fs.readFileSync(path.join(cfg.seedDir, 'vocabulary.json'), 'utf8')) as {
    symbols: { id: string; page: string; row: number; col: number; kind: string; emoji: string; en: string; es: string; photo?: string }[];
  };
  const m = vocab.symbols.find((s) => s.id === 'music')!;
  const now = new Date().toISOString();
  const slotFree = (slot: number) => !db.get("SELECT 1 FROM items WHERE parent_id IS NULL AND orbit = 'inner' AND orbit_slot = ?", slot);
  const slot = [6, 7, 0, 1, 2, 3, 4, 5].find(slotFree) ?? null;
  const cellFree = !db.get('SELECT 1 FROM items WHERE grid_page = ? AND grid_row = ? AND grid_col = ?', m.page, m.row, m.col);
  db.run(
    `INSERT INTO items(id, category, kind, label_en, label_es, short_label, emoji, orbit, orbit_slot, grid_page, grid_row, grid_col, updated_at)
     VALUES('music', 'play', ?, ?, ?, 'Music', ?, ?, ?, ?, ?, ?, ?)`,
    m.kind, m.en, m.es, m.emoji, slot === null ? null : 'inner', slot,
    cellFree ? m.page : null, cellFree ? m.row : null, cellFree ? m.col : null, now,
  );
  if (m.photo) copySeedImage(db, cfg, m.photo, 'item', 'music', now);
}

interface V2Person {
  id: string; kind: 'person' | 'pet'; short_label: string; label_es: string | null; emoji: string | null;
  is_visible: number; user_id: number | null;
}
interface V2Symbol {
  id: string; category: string; kind: string; emoji: string; label_en: string; label_es: string; grid_page: string;
  grid_row: number; grid_col: number; is_hidden: number; badge_color: string | null; log_trackable: number; alias_of: string | null;
}

function migrateV2toV3(db: Db, cfg: Config) {
  const now = new Date().toISOString();

  // 1. People and words become items (one namespace).
  const people = db.all<V2Person>('SELECT p.*, u.id AS user_id FROM people p LEFT JOIN users u ON u.person_id = p.id');
  const symbols = db.all<V2Symbol>('SELECT * FROM symbols');
  const clash = symbols.find((s) => people.some((p) => p.id === s.id));
  if (clash) throw new Error(`Cannot migrate: "${clash.id}" is both a person and a word`);

  for (const p of people) {
    db.run(
      `INSERT INTO items(id, category, kind, label_en, label_es, short_label, emoji, user_id, is_hidden, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      p.id, p.kind, p.kind, p.short_label, p.label_es ?? p.short_label, p.short_label, p.emoji, p.user_id, p.is_visible ? 0 : 1, now,
    );
  }
  for (const s of symbols) {
    db.run(
      `INSERT INTO items(id, category, kind, label_en, label_es, emoji, grid_page, grid_row, grid_col, is_hidden, badge_color, log_trackable, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.id, PAGE_CATEGORY[s.category] ?? PAGE_CATEGORY[s.grid_page] ?? 'core', s.kind, s.label_en, s.label_es, s.emoji,
      s.grid_page, s.grid_row, s.grid_col, s.is_hidden, s.badge_color, s.log_trackable, now,
    );
  }
  for (const s of symbols) if (s.alias_of) db.run('UPDATE items SET alias_of = ? WHERE id = ?', s.alias_of, s.id);

  // 2. Limits become rules.
  for (const l of db.all<{ symbol_id: string; max_per_day: number | null; min_interval_min: number | null; suggest_symbol_id: string | null }>('SELECT * FROM limits')) {
    insertLimitRules(db, l.symbol_id, { max_per_day: l.max_per_day, min_interval_min: l.min_interval_min, suggest: l.suggest_symbol_id });
  }

  // 3. Pictures: person/symbol owners become 'item'.
  db.raw.exec(`
    CREATE TABLE images_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('item','media')),
      owner_id TEXT NOT NULL, file TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL);
    INSERT INTO images_v3(id, owner_type, owner_id, file, is_active, uploaded_by, created_at)
      SELECT id, CASE owner_type WHEN 'media' THEN 'media' ELSE 'item' END, owner_id, file, is_active, uploaded_by, created_at FROM images;
    DROP TABLE images;
    ALTER TABLE images_v3 RENAME TO images;
    CREATE INDEX images_owner ON images(owner_type, owner_id, is_active);`);

  // 4. The daily log now points at items.
  db.raw.exec(`
    CREATE TABLE log_entries_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, symbol_id TEXT REFERENCES items(id),
      amount REAL, note TEXT, at TEXT NOT NULL, entered_by INTEGER NOT NULL REFERENCES users(id));
    INSERT INTO log_entries_v3 SELECT id, type, symbol_id, amount, note, at, entered_by FROM log_entries;
    DROP TABLE log_entries;
    ALTER TABLE log_entries_v3 RENAME TO log_entries;
    CREATE INDEX log_at ON log_entries(at);`);

  // 5. People keep only their details.
  db.raw.exec(`
    CREATE TABLE people_v3 (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('person','pet')), display_name TEXT NOT NULL, relation TEXT,
      role TEXT CHECK (role IN ('child','caretaker','friend')), is_self INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL,
      species TEXT, breed TEXT);
    INSERT INTO people_v3 SELECT id, kind, display_name, relation, role, is_self, sort_order, species, breed FROM people;
    DROP TABLE people;
    ALTER TABLE people_v3 RENAME TO people;`);

  // 6. Voice replies he could already hear become voice notes (already heard).
  db.run(
    `INSERT INTO voice_notes(from_user_id, audio_file, created_at, heard_at, source)
     SELECT from_user_id, audio_file, created_at, created_at, 'reply' FROM replies WHERE audio_file IS NOT NULL ORDER BY id`,
  );

  db.raw.exec('DROP TABLE limits; DROP TABLE symbols;');

  // 7. The orbit layout, body parts, Pongo and starter rules.
  applyOrbitDefaults(db, cfg);

  const broken = db.all<{ table: string }>('PRAGMA foreign_key_check');
  if (broken.length) throw new Error(`Migration left ${broken.length} broken links (first in ${broken[0].table}); nothing was changed`);
}
