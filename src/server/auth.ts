import crypto from 'node:crypto';
import type { Role } from '../shared/types.ts';
import { HttpError, type Middleware } from './http.ts';

export interface AuthUser {
  id: number;
  role: Role;
  person_id: string | null;
  /** true for the short-lived caretaker token opened from the tablet's parent gate */
  elevated?: boolean;
}

interface TokenPayload extends AuthUser {
  exp: number; // epoch seconds
}

export const COOKIE = 'jt';

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export class Tokens {
  constructor(private secret: string) {}

  sign(user: AuthUser, ttlSeconds: number): string {
    const payload: TokenPayload = { ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
    const body = b64(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verify(token: string | undefined): AuthUser | null {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (p.exp < Date.now() / 1000) return null;
      return { id: p.id, role: p.role, person_id: p.person_id, elevated: p.elevated };
    } catch {
      return null;
    }
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Reads a Bearer token (API / elevated parent mode) or the session cookie (images, audio, SSE). */
export function authenticate(tokens: Tokens): Middleware {
  return async (ctx, next) => {
    const h = ctx.req.headers.authorization;
    const bearer = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
    ctx.user = tokens.verify(bearer) ?? tokens.verify(parseCookies(ctx.req.headers.cookie)[COOKIE]) ?? undefined;
    return next();
  };
}

export function requireAuth(...roles: Role[]): Middleware {
  return async (ctx, next) => {
    if (!ctx.user) throw new HttpError(401, 'Sign in required');
    if (roles.length && !roles.includes(ctx.user.role)) throw new HttpError(403, 'Not allowed for this role');
    return next();
  };
}

/** Simple lockout: 5 wrong PINs for a username -> locked for 60 s. */
export class LoginLimiter {
  private fails = new Map<string, { count: number; until: number }>();

  check(key: string) {
    const f = this.fails.get(key);
    if (f && f.until > Date.now()) throw new HttpError(429, 'Too many attempts. Wait a minute.');
  }
  fail(key: string) {
    const f = this.fails.get(key) ?? { count: 0, until: 0 };
    f.count += 1;
    if (f.count >= 5) {
      f.until = Date.now() + 60_000;
      f.count = 0;
    }
    this.fails.set(key, f);
  }
  ok(key: string) {
    this.fails.delete(key);
  }
  reset() {
    this.fails.clear();
  }
}
