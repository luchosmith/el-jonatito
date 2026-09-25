// Upgrades an older database in place.
// v2 -> v3: `symbols` and the display fields of `people` become `items`; `limits` become `item_rules`;
// pictures move to owner_type 'item'; voice replies are copied into `voice_notes`.
// A full copy of the old database is written next to it first (jonatito.sqlite.v2-backup-<time>).
import fs from 'node:fs';
import type { Db } from './db.ts';
import type { Config } from './config.ts';
import { applyOrbitDefaults, insertLimitRules, PAGE_CATEGORY } from './orbit.ts';

export const SCHEMA_VERSION = 3;

const tableExists = (db: Db, name: string) => !!db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name);

export function schemaVersion(db: Db): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')!.user_version;
}

/** Returns the backup file when a migration ran, null when the database was already current. */
export function migrate(db: Db, cfg: Config): string | null {
  if (schemaVersion(db) >= SCHEMA_VERSION) return null;
  if (!tableExists(db, 'symbols')) return null; // a new, empty v3 database: seed() sets the version

  const backup = cfg.dbFile === ':memory:' ? null : `${cfg.dbFile}.v2-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (backup) {
    if (fs.existsSync(backup)) fs.rmSync(backup);
    db.raw.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  }

  db.raw.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => migrateV2toV3(db, cfg));
  } finally {
    db.raw.exec('PRAGMA foreign_keys = ON');
  }
  db.raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return backup ?? ':memory:';
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
