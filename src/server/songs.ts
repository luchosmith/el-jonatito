// His songs (the 🎧 Music playlist). Imported once from a folder of audio files: the name and artist
// come from the file's tags (or its file name), the cover art is taken out of the file when it has one.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import type { Db } from './db.ts';

const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm'];

interface Tags { title?: string; artist?: string }

function tagsOf(file: string): Tags {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=title,artist', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) return {};
  const t = (JSON.parse(r.stdout || '{}').format?.tags ?? {}) as Record<string, string>;
  const low = Object.fromEntries(Object.entries(t).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  return { title: low.title || undefined, artist: low.artist || undefined };
}

/** "01 - Dura.mp3" -> "Dura"; "aha - take on me" (no artist tag) -> artist "aha", title "take on me". */
export function songName(fileName: string, tags: Tags): { title: string; artist: string | null } {
  let title = (tags.title ?? path.parse(fileName).name).replace(/^\d{1,3}\s*[-.]?\s*/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  let artist = tags.artist ?? null;
  if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ');
    artist = parts[0].trim();
    title = parts[parts.length - 1].trim();
  }
  return { title: title || path.parse(fileName).name, artist };
}

/** The file's embedded picture as a 300 px square JPEG in uploads/images, or null. */
function extractCover(src: string, uploadsDir: string): string | null {
  const dir = path.join(uploadsDir, 'images');
  fs.mkdirSync(dir, { recursive: true });
  const name = `song-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-an', '-frames:v', '1',
    '-vf', 'scale=300:300:force_original_aspect_ratio=increase,crop=300:300', path.join(dir, name)]);
  return r.status === 0 && fs.existsSync(path.join(dir, name)) ? name : null;
}

/** Imports every audio file in `dir` that is not in the list yet. Returns how many were added. */
export function importSongs(db: Db, cfg: Config, dir: string): { added: number; skipped: number } {
  const files = fs.readdirSync(dir).filter((f) => AUDIO_EXT.includes(path.extname(f).toLowerCase())).sort();
  const songsDir = path.join(cfg.uploadsDir, 'songs');
  fs.mkdirSync(songsDir, { recursive: true });
  let added = 0;
  let skipped = 0;
  for (const f of files) {
    if (db.get('SELECT 1 FROM songs WHERE source = ?', f)) {
      skipped++;
      continue;
    }
    const src = path.join(dir, f);
    const { title, artist } = songName(f, tagsOf(src));
    const file = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f).toLowerCase()}`;
    fs.copyFileSync(src, path.join(songsDir, file));
    db.run('INSERT INTO songs(title, artist, file, cover, source, added_at) VALUES(?,?,?,?,?,?)',
      title, artist, file, extractCover(src, cfg.uploadsDir), f, new Date().toISOString());
    added++;
  }
  return { added, skipped };
}
