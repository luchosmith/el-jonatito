import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export type Param = SQLInputValue;

/** Thin typed wrapper around node:sqlite (built into Node >= 22.13, no native build step). */
export class Db {
  readonly raw: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.raw.exec(fs.readFileSync(schemaFile, 'utf8'));
  }

  all<T>(sql: string, ...params: Param[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T>(sql: string, ...params: Param[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: Param[]): { changes: number; lastId: number } {
    const r = this.raw.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  }

  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  setting<T>(key: string, fallback: T): T {
    const row = this.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : fallback;
  }

  setSetting(key: string, value: unknown) {
    this.run(
      'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
  }

  /** Remove every row (used by seed reset and tests). */
  wipe() {
    this.raw.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM notify_queue; DELETE FROM notify_prefs; DELETE FROM tap_events; DELETE FROM moments; DELETE FROM events;
      DELETE FROM pain_reports; DELETE FROM voice_notes; DELETE FROM locations; DELETE FROM audio_clips; DELETE FROM item_rules;
      DELETE FROM media_sessions; DELETE FROM schedule_days; DELETE FROM schedule_items; DELETE FROM availability;
      DELETE FROM log_entries; DELETE FROM replies; DELETE FROM message_recipients; DELETE FROM messages;
      DELETE FROM images; DELETE FROM items; DELETE FROM media; DELETE FROM users; DELETE FROM people;
      DELETE FROM settings; DELETE FROM audit; DELETE FROM sqlite_sequence;
      PRAGMA foreign_keys = ON;`);
  }

  close() {
    this.raw.close();
  }
}
