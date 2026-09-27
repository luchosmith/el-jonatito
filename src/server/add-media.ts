// Links a video or song that is already on the server (e.g. a whole film, too big to upload) to a
// media item. Usage: npm run media:add -- "<media title>" <file>
import { loadConfig } from './config.ts';
import { Db } from './db.ts';
import { copyMediaFile } from './uploads.ts';

const [title, src] = process.argv.slice(2);
if (!title || !src) {
  console.error('Usage: npm run media:add -- "<media title>" <file>');
  process.exit(1);
}
const cfg = loadConfig({ ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET ?? 'unused' });
const db = new Db(cfg.dbFile);
const m = db.get<{ id: number; file: string | null }>('SELECT id, file FROM media WHERE title = ?', title);
if (!m) {
  console.error(`No media called "${title}"`);
  process.exit(1);
}
const file = copyMediaFile(cfg.uploadsDir, src);
db.run('UPDATE media SET file = ? WHERE id = ?', file, m.id);
console.log(`"${title}" now plays ${file}${m.file ? ` (was ${m.file}; the old file is kept)` : ''}. Restart the app to refresh open tablets.`);
db.close();
