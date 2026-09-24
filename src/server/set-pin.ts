// Usage: npm run set-pin -- <username> <new-pin>
import { loadConfig } from './config.ts';
import { Db } from './db.ts';
import { hashPin } from './auth.ts';

const [username, pin] = process.argv.slice(2);
if (!username || !pin || !/^\d{4,8}$/.test(pin)) {
  console.error('Usage: npm run set-pin -- <username> <4-8 digit PIN>');
  process.exit(1);
}
const db = new Db(loadConfig({ ...process.env, TOKEN_SECRET: process.env.TOKEN_SECRET ?? 'unused' }).dbFile);
const r = db.run('UPDATE users SET pin_hash = ? WHERE username = ?', hashPin(pin), username.toLowerCase());
console.log(r.changes ? `PIN updated for ${username}` : `No user named ${username}`);
db.close();
