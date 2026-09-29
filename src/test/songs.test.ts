import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Db } from '../server/db.ts';
import { loadConfig } from '../server/config.ts';
import { migrate } from '../server/migrate.ts';
import { seed } from '../server/seed.ts';
import { listItems } from '../server/repo.ts';
import { importSongs, songName } from '../server/songs.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

test('song names: tags first; track numbers and [Explicit] go; "artist - title" file names split', () => {
  assert.deepEqual(songName('04 - La Camisa Negra [Explicit].mp3', { title: 'La Camisa Negra', artist: 'Juanes' }), { title: 'La Camisa Negra', artist: 'Juanes' });
  assert.deepEqual(songName('01. Clandestino.mp3', {}), { title: 'Clandestino', artist: null });
  assert.deepEqual(songName('aha - take on me.mp3', { title: 'aha - take on me' }), { title: 'take on me', artist: 'aha' });
  assert.deepEqual(songName('003 Desnudate Mujer - Frankie Ruiz.mp3', { title: 'Desnudate Mujer (Frankie Ruiz)', artist: 'Frankie Ruiz' }), { title: 'Desnudate Mujer (Frankie Ruiz)', artist: 'Frankie Ruiz' });
});

test('importing a folder: files copied, cover art taken out of the file, a second import skips them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-songs-'));
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  const db = new Db(cfg.dbFile);
  seed(db, cfg);
  const folder = path.join(here, '..', 'e2e', 'fixtures', 'music');
  assert.deepEqual(importSongs(db, cfg, folder), { added: 3, skipped: 0 });
  const rows = db.all<{ title: string; artist: string | null; file: string; cover: string | null }>('SELECT * FROM songs ORDER BY source');
  assert.deepEqual(rows.map((r) => [r.title, r.artist, !!r.cover]), [['Tiny Tune', 'The Testers', true], ['Third One', 'Band', false], ['Short Song', 'The Beeps', false]]);
  for (const r of rows) assert.ok(fs.existsSync(path.join(cfg.uploadsDir, 'songs', r.file)));
  assert.ok(fs.existsSync(path.join(cfg.uploadsDir, 'images', rows[0].cover!)));
  assert.deepEqual(importSongs(db, cfg, folder), { added: 0, skipped: 3 });
  db.close();
});

test('v13: 🎧 Music plays his songs (a "Music" media row linked to the item)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-migrate13-'));
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  const db = new Db(cfg.dbFile);
  seed(db, cfg);
  db.run("UPDATE items SET tap = 'add', media_id = NULL WHERE id = 'music'");
  db.run("DELETE FROM media WHERE kind = 'music'");
  db.raw.exec('PRAGMA user_version = 12');
  migrate(db, cfg);
  const music = listItems(db, new Date()).find((i) => i.id === 'music')!;
  const media = db.get<{ id: number }>("SELECT id FROM media WHERE kind = 'music'")!;
  assert.deepEqual([music.tap, music.media_id, music.orbit_slot], ['play', media.id, 6]);
  db.close();
});
