import type { Deps } from '../app.ts';
import { COOKIE, requireAuth, verifyPin } from '../auth.ts';
import { HttpError, jsonBody } from '../http.ts';
import { getPerson } from '../repo.ts';
import { obj, str } from '../validate.ts';
import type { Role } from '../../shared/types.ts';

const SESSION_TTL = 60 * 60 * 24 * 90; // 90 days (the tablet stays signed in)
const ELEVATED_TTL = 60 * 10; // parent mode from the tablet: 10 minutes

interface UserRow { id: number; username: string; pin_hash: string; role: Role; person_id: string | null }

export function authRoutes({ router, db, tokens, limiter, cfg }: Deps) {
  router.post('/api/auth/login', jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const username = str(body, 'username', { max: 40 })!.trim().toLowerCase();
    const pin = str(body, 'pin', { max: 12, pattern: /^\d{4,8}$/ })!;
    limiter.check(`login:${username}`);
    const u = db.get<UserRow>('SELECT * FROM users WHERE username = ?', username);
    if (!u || !verifyPin(pin, u.pin_hash)) {
      limiter.fail(`login:${username}`);
      throw new HttpError(401, 'Wrong name or PIN');
    }
    limiter.ok(`login:${username}`);
    const token = tokens.sign({ id: u.id, role: u.role, person_id: u.person_id }, SESSION_TTL);
    const secure = cfg.testMode ? '' : '; Secure';
    ctx.res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${secure}`);
    return { token, user: publicUser(db, u) };
  });

  router.post('/api/auth/logout', (ctx) => {
    ctx.res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  });

  router.get('/api/me', requireAuth(), (ctx) => {
    const u = db.get<UserRow>('SELECT * FROM users WHERE id = ?', ctx.user!.id);
    if (!u) throw new HttpError(401, 'Unknown user');
    return { user: publicUser(db, u), elevated: !!ctx.user!.elevated };
  });

  /** Parent gate on the child's tablet: any caretaker PIN opens a 10-minute caretaker session. */
  router.post('/api/auth/elevate', requireAuth('child'), jsonBody, (ctx) => {
    const pin = str(obj(ctx.body), 'pin', { max: 12, pattern: /^\d{4,8}$/ })!;
    limiter.check('elevate');
    const caretaker = db
      .all<UserRow>("SELECT * FROM users WHERE role = 'caretaker'")
      .find((u) => verifyPin(pin, u.pin_hash));
    if (!caretaker) {
      limiter.fail('elevate');
      throw new HttpError(401, 'Wrong PIN');
    }
    limiter.ok('elevate');
    const token = tokens.sign({ id: caretaker.id, role: 'caretaker', person_id: caretaker.person_id, elevated: true }, ELEVATED_TTL);
    return { token, user: publicUser(db, caretaker), expires_in: ELEVATED_TTL };
  });
}

function publicUser(db: Deps['db'], u: UserRow) {
  const person = u.person_id ? getPerson(db, u.person_id) : undefined;
  return { id: u.id, username: u.username, role: u.role, person_id: u.person_id, display_name: person?.short_label ?? u.username };
}
