// Adds a folder of songs to his 🎧 Music playlist (songs already in it are skipped).
// Usage: npm run music:import -- <folder>
import { loadConfig } from './config.ts';
import { Db } from './db.ts';
import { importSongs } from './songs.ts';

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: npm run music:import -- <folder>');
  process.exit(1);
}
const cfg = loadConfig({ ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET ?? 'unused' });
const db = new Db(cfg.dbFile);
const { added, skipped } = importSongs(db, cfg, dir);
console.log(`${added} songs added${skipped ? `, ${skipped} already there` : ''}. Restart the app to refresh open tablets.`);
db.close();
