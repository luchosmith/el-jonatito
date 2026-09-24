import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import { Db } from './db.ts';
import { authenticate, LoginLimiter, requireAuth, Tokens } from './auth.ts';
import { EventHub } from './events.ts';
import { jsonBody, mimeOf, Router, safeJoin, sendJson, HttpError } from './http.ts';
import { clock } from './clock.ts';
import { isSeeded, seed } from './seed.ts';
import { obj, str } from './validate.ts';
import { authRoutes } from './routes/auth.ts';
import { boardRoutes } from './routes/board.ts';
import { messageRoutes } from './routes/messages.ts';
import { dayRoutes } from './routes/day.ts';

export interface Deps {
  router: Router;
  db: Db;
  cfg: Config;
  tokens: Tokens;
  hub: EventHub;
  limiter: LoginLimiter;
  now: () => Date;
  weather: () => Promise<{ temp_c: number; code: number } | null>;
}

/** Weather from Open-Meteo (free, no key), cached for 15 minutes. */
function weatherFetcher(cfg: Config) {
  let cache: { at: number; value: { temp_c: number; code: number } | null } | null = null;
  return async () => {
    if (cfg.testMode) return { temp_c: 18, code: 2 };
    if (cache && Date.now() - cache.at < 15 * 60_000) return cache.value;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&current=temperature_2m,weather_code`;
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const j = (await r.json()) as { current: { temperature_2m: number; weather_code: number } };
      cache = { at: Date.now(), value: { temp_c: Math.round(j.current.temperature_2m), code: j.current.weather_code } };
    } catch {
      cache = { at: Date.now(), value: cache?.value ?? null };
    }
    return cache.value;
  };
}

export function createApp(cfg: Config) {
  const db = new Db(cfg.dbFile);
  if (!isSeeded(db)) seed(db, cfg);

  const router = new Router();
  const tokens = new Tokens(cfg.tokenSecret);
  const hub = new EventHub();
  const limiter = new LoginLimiter();
  const deps: Deps = { router, db, cfg, tokens, hub, limiter, now: () => clock.now(), weather: weatherFetcher(cfg) };

  router.use(authenticate(tokens));
  authRoutes(deps);
  boardRoutes(deps);
  messageRoutes(deps);
  dayRoutes(deps);

  router.get('/api/events', requireAuth(), (ctx) => {
    ctx.handled = true;
    hub.subscribe(ctx.user!.id, ctx.res);
  });

  router.get('/api/health', () => ({ ok: true }));

  if (cfg.testMode) {
    // Test-only controls, never registered in production.
    router.post('/api/test/reset', () => {
      db.wipe();
      seed(db, cfg);
      limiter.reset();
      clock.set(null);
      return { ok: true };
    });
    router.post('/api/test/clock', jsonBody, (ctx) => {
      const iso = str(obj(ctx.body), 'iso', { optional: true, max: 40 });
      clock.set(iso ? new Date(iso) : null);
      return { now: clock.now().toISOString() };
    });
  }

  const indexFile = path.join(cfg.webDist, 'index.html');
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self), geolocation=()');
    try {
      if (await router.handle(req, res)) return;
      const url = new URL(req.url ?? '/', 'http://local');
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
      // Static web app (SPA fallback to index.html)
      let file = indexFile;
      if (url.pathname !== '/') {
        try {
          const candidate = safeJoin(cfg.webDist, decodeURIComponent(url.pathname.slice(1)));
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) file = candidate;
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
        }
      }
      if (!fs.existsSync(file)) return sendJson(res, 503, { error: 'Web app not built. Run: npm run build:web' });
      const isAsset = file !== indexFile && url.pathname.startsWith('/assets/');
      res.writeHead(200, {
        'Content-Type': mimeOf(file),
        'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Content-Security-Policy':
          "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'",
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal error' });
    }
  });

  return {
    server,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
