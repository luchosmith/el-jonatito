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
import { importSongs, normalizeSongs, songName } from '../server/songs.ts';
import { spawnSync } from 'node:child_process';

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

/** Integrated loudness (LUFS) of a file, measured by ffmpeg. */
function loudness(file: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split('Summary:').pop() ?? '');
  return Number(m?.[1]);
}

test('loudness is evened out: a very quiet and a very loud song end up at about the same volume', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-loud-'));
  const src = path.join(dir, 'src');
  fs.mkdirSync(src);
  const tone = (name: string, db: number) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-af', `volume=${db}dB`, '-c:a', 'libmp3lame', path.join(src, name)]);
  tone('quiet.mp3', -28);
  tone('loud.mp3', -1);
  const before = [loudness(path.join(src, 'quiet.mp3')), loudness(path.join(src, 'loud.mp3'))];
  assert.ok(before[1] - before[0] > 20, `the test tones really differ: ${before}`);
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  const db = new Db(cfg.dbFile);
  seed(db, cfg);
  importSongs(db, cfg, src);
  const rows = db.all<{ file: string; normalized: number }>('SELECT file, normalized FROM songs ORDER BY source');
  assert.deepEqual(rows.map((r) => r.normalized), [1, 1]);
  const after = rows.map((r) => loudness(path.join(cfg.uploadsDir, 'songs', r.file)));
  assert.ok(Math.abs(after[0] - after[1]) < 1.5, `evened out: ${after}`);
  for (const a of after) assert.ok(Math.abs(a - -16) < 1.5, `near -16 LUFS: ${a}`);
  db.close();
});

test('songs imported before evening-out existed are evened out by normalizeSongs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-norm-'));
  const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dir });
  const db = new Db(cfg.dbFile);
  seed(db, cfg);
  importSongs(db, cfg, path.join(here, '..', 'e2e', 'fixtures', 'music'));
  db.run('UPDATE songs SET normalized = 0');
  const { done, failed } = normalizeSongs(db, cfg);
  assert.deepEqual({ done, failed }, { done: 3, failed: 0 });
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM songs WHERE normalized = 1')!.n, 3);
  assert.equal(fs.readdirSync(path.join(cfg.uploadsDir, 'songs')).length, 3, 'the old files are gone');
  db.close();
});
