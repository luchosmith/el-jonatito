// Evens out the loudness of songs imported before it was automatic, so every song plays at the same volume.
// Usage: npm run music:normalize
import { loadConfig } from './config.ts';
import { Db } from './db.ts';
import { normalizeSongs } from './songs.ts';

const cfg = loadConfig({ ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET ?? 'unused' });
const db = new Db(cfg.dbFile);
const { done, failed } = normalizeSongs(db, cfg, (m) => console.log(m));
console.log(`${done} songs evened out${failed ? `, ${failed} left as they were` : ''}. Restart the app to refresh open tablets.`);
db.close();
