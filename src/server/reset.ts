// Wipes the database and re-loads everything from /seed. Usage: npm run seed:reset
import { loadConfig } from './config.ts';
import { Db } from './db.ts';
import { seed } from './seed.ts';

const cfg = loadConfig({ ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET ?? 'unused' });
const db = new Db(cfg.dbFile);
db.wipe();
seed(db, cfg);
db.close();
console.log(`Database reset from seed: ${cfg.dbFile}`);
