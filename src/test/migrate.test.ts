// Upgrading a v2 database (symbols + limits) to the v3 item catalog, in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Db } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { migrate, schemaVersion } from '../server/migrate.ts';
import { listItems, listPeople } from '../server/repo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

function v2Database(file: string) {
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(here, 'fixtures', 'schema-v2.sql'), 'utf8'));
  db.exec(`
    INSERT INTO people(id, kind, display_name, short_label, label_es, relation, role, is_self, is_visible, sort_order, emoji) VALUES
      ('jonatito','person','Jonatito','Me','Yo','self','child',1,1,0,'🧑'),
      ('mommy_joyce','person','Joyce','Mommy Joyce','Mommy Joyce','mother','caretaker',0,1,1,'👩'),
      ('tintin','person','TinTin','TinTin Renamed','TinTin','cousin','friend',0,0,5,'🧑'),
      ('lexi','pet','Lexi','Lexi','Lexi',NULL,NULL,0,1,10,'🐩');
    INSERT INTO users(username, pin_hash, role, person_id) VALUES
      ('jonatito','x','child','jonatito'), ('joyce','x','caretaker','mommy_joyce'), ('tintin','x','friend','tintin');
    INSERT INTO symbols(id, category, kind, emoji, label_en, label_es, grid_page, grid_row, grid_col, is_hidden, log_trackable, alias_of) VALUES
      ('eat','action','action','😋','eat','comer','action',0,0,0,0,NULL),
      ('bath','action','action','🛁','take a bath','bañarme','action',0,5,0,0,NULL),
      ('grapes','food','thing','🍇','grapes','uvas','food',0,4,0,1,NULL),
      ('water','drink','thing','💧','water','agua','food',0,0,0,1,NULL),
      ('water_d','drink','thing','💧','water','agua','drink',0,0,1,1,'water'),
      ('smoothie','drink','thing','🥤','smoothie','batido','food',0,1,0,1,NULL),
      ('come_see','face','social','👀','come see','ven a ver','face',0,0,0,0,NULL);
    INSERT INTO limits(symbol_id, max_per_day, min_interval_min, suggest_symbol_id) VALUES ('smoothie',2,NULL,'water'), ('grapes',NULL,60,NULL);
    INSERT INTO images(owner_type, owner_id, file, is_active, created_at) VALUES
      ('person','mommy_joyce','joyce.jpg',1,'2026-09-01'), ('symbol','grapes','grapes.jpg',1,'2026-09-01'), ('media','1','cover.svg',1,'2026-09-01');
    INSERT INTO media(title, kind, emoji, bedtime_ok, sort_order) VALUES ('Trains','movie','🚂',0,0);
    INSERT INTO schedule_items(emoji, label, symbol_id, start_min) VALUES ('🌅','wake',NULL,420), ('🍇','snack',NULL,900);
    INSERT INTO log_entries(type, symbol_id, amount, at, entered_by) VALUES ('food','grapes',0.5,'2026-09-20T15:00:00Z',2);
    INSERT INTO messages(from_user_id, to_person_id, tokens, sentence_en, sentence_es, created_at) VALUES (1,'mommy_joyce','[]','x','x','2026-09-20');
    INSERT INTO replies(message_id, from_user_id, kind, audio_file, created_at) VALUES (1,2,'voice','hola.webm','2026-09-20T16:00:00Z');`);
  db.close();
}

test('a v2 database is backed up, upgraded to v3, and keeps its data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-migrate-'));
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  v2Database(cfg.dbFile);

  const db = new Db(cfg.dbFile); // applies the v3 schema next to the old tables, like a real restart
  const backup = migrate(db, cfg);
  assert.ok(backup && fs.existsSync(backup), 'writes a backup copy first');
  assert.equal(schemaVersion(db), 5);
  const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  assert.ok(!tables.includes('symbols') && !tables.includes('limits'));
  assert.equal(db.all('PRAGMA foreign_key_check').length, 0);

  // People: display fields now come from items; hidden stays hidden; accounts stay linked.
  const people = listPeople(db);
  assert.equal(people.find((p) => p.id === 'tintin')?.short_label, 'TinTin Renamed');
  assert.equal(people.find((p) => p.id === 'tintin')?.is_visible, false);
  assert.match(people.find((p) => p.id === 'mommy_joyce')?.photo_url ?? '', /joyce\.jpg/);

  const items = listItems(db, new Date('2026-09-23T12:00:00'));
  const item = (id: string) => items.find((i) => i.id === id)!;
  assert.equal(item('mommy_joyce').user_id, 2);
  assert.equal(item('water_d').alias_of, 'water');
  assert.equal(item('water_d').is_hidden, true);
  assert.equal(item('come_see').category, 'social');
  assert.match(item('grapes').photo_url ?? '', /grapes\.jpg/);

  // Orbit layout: Eat opens the foods (it shows grapes), people take outer slots skipping 12:00 and 6:00.
  assert.deepEqual([item('eat').orbit, item('eat').orbit_slot, item('eat').tap, item('eat').emoji], ['inner', 0, 'open', '🍇']);
  assert.equal(item('mommy_joyce').orbit_slot, 1);
  assert.equal(item('tintin').orbit_slot, 2);
  assert.equal(item('lexi').orbit, null);
  assert.equal(item('grapes').parent_id, 'eat');
  assert.equal(items.filter((i) => i.category === 'body').length, 12);
  assert.deepEqual([item('music').orbit, item('music').orbit_slot, item('music').short_label], ['inner', 6, 'Music']);
  assert.match(item('music').photo_url ?? '', /music\.svg/);

  // Limits became rules: a daily maximum closes; the old "recent" reminder stays a reminder.
  assert.deepEqual(item('smoothie').rules.map((r) => [r.kind, r.blocks, r.max_per_day, r.suggest_item_id]), [['limit', true, 2, 'water']]);
  assert.ok(item('grapes').rules.some((r) => r.kind === 'interval' && !r.blocks && r.min_interval_min === 60));
  assert.ok(item('grapes').rules.some((r) => r.kind === 'window' && r.blocks), 'snack-time window from seed/orbit.json');

  // Pictures, log and voice.
  assert.deepEqual(db.all<{ owner_type: string }>('SELECT DISTINCT owner_type FROM images ORDER BY 1').map((r) => r.owner_type), ['item', 'media']);
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM log_entries')!.n, 1);
  const voice = db.all<{ audio_file: string; heard_at: string | null; source: string }>('SELECT audio_file, heard_at, source FROM voice_notes');
  assert.deepEqual(voice.map((v) => [v.audio_file, !!v.heard_at, v.source]), [['hola.webm', true, 'reply']]);

  // Running it again does nothing.
  assert.equal(migrate(db, cfg), null);
  db.close();
});

test('a v3 database gets Music in a free inner slot (and never moves anything else)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-migrate4-'));
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  v2Database(cfg.dbFile);
  const db = new Db(cfg.dbFile);
  migrate(db, cfg);
  // Pretend it is a v3 database whose slot 6 a caretaker has used, without Music yet.
  db.run("DELETE FROM images WHERE owner_id = 'music'");
  db.run("DELETE FROM items WHERE id = 'music'");
  db.run("UPDATE items SET orbit_slot = 6 WHERE id = 'bath'");
  db.raw.exec('PRAGMA user_version = 3');
  const backup = migrate(db, cfg);
  assert.match(backup ?? '', /\.v3-backup-/);
  const items = listItems(db, new Date());
  assert.equal(items.find((i) => i.id === 'bath')!.orbit_slot, 6);
  assert.equal(items.find((i) => i.id === 'music')!.orbit_slot, 7);
  assert.equal(schemaVersion(db), 5);
  db.close();
});
