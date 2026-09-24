import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const PINS: Record<string, string> = {
  jonatito: '1000', joyce: '1234', lucho: '1111', larry: '2222', pilar: '3333', tintin: '4444',
};

/** A fixed afternoon (Wednesday, autumn) in the family's time zone. */
export const AFTERNOON = '2026-09-23T15:40:00-04:00';

export async function resetDb(request: APIRequestContext) {
  const r = await request.post('/api/test/reset');
  expect(r.ok()).toBeTruthy();
}

/** Freezes the server clock (and optionally the browser clock) at `iso`. */
export async function setClock(request: APIRequestContext, iso: string | null, pages: Page[] = []) {
  const r = await request.post('/api/test/clock', { data: { iso } });
  expect(r.ok()).toBeTruthy();
  for (const p of pages) if (iso) await p.clock.setFixedTime(new Date(iso));
}

/** Signs in through the real login form. */
export async function login(page: Page, username: string, pin = PINS[username]) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-pin').fill(pin);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId(username === 'jonatito' ? 'child-app' : 'family-app')).toBeVisible();
}

/** A separate browser context = a separate device (tablet, grandma's phone, ...). */
export async function device(browser: Browser, username: string, opts: { clock?: string } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (opts.clock) await page.clock.setFixedTime(new Date(opts.clock));
  await login(page, username);
  return { context, page };
}

/** Authenticated API calls, as a given user. */
export async function apiAs(request: APIRequestContext, username: string) {
  const r = await request.post('/api/auth/login', { data: { username, pin: PINS[username] } });
  expect(r.ok()).toBeTruthy();
  const { token } = (await r.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request.get(url, { headers }),
    post: (url: string, data?: unknown) => request.post(url, { headers, data: data ?? {} }),
    put: (url: string, data?: unknown) => request.put(url, { headers, data: data ?? {} }),
    patch: (url: string, data: unknown) => request.patch(url, { headers, data }),
    del: (url: string) => request.delete(url, { headers }),
    raw: (method: 'POST' | 'PUT', url: string, body: Buffer, contentType: string) =>
      request.fetch(url, { method, headers: { ...headers, 'Content-Type': contentType }, data: body }),
  };
}

/** Taps pictures on the child's board: page id, then symbol ids. */
export async function build(page: Page, steps: ({ page: string } | string)[]) {
  for (const s of steps) {
    if (typeof s === 'string') await page.getByTestId(`sym-${s}`).click();
    else await page.getByTestId(`page-${s.page}`).click();
  }
}

/** A tiny valid JPEG (8x8) for photo upload tests. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCeiiivnT6Q/9k=',
  'base64',
);
/** A few bytes that the server accepts as audio/webm (content is not decoded server-side). */
export const FAKE_WEBM = Buffer.from('1a45dfa39f4286810142f7810142f2810442f381084282847765626d', 'hex');
