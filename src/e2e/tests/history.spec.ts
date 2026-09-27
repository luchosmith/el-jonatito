// v0.9: two strips. On top his schedule (what should happen); under it his history (what really
// happened: what he watched, ate, sent, and who reached him). Every tap echoes big, then flies left.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('the history strip shows what really happened, newest next to NOW; nothing to the right of NOW', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  await joyce.post('/api/logs', { type: 'food', symbol_id: 'grapes', amount: 1, at: '2026-09-23T13:10:00-04:00' });
  await joyce.post('/api/logs', { type: 'meds', note: 'vitamins', at: '2026-09-23T13:20:00-04:00' }); // not food: not on his strip
  const child = await apiAs(request, 'jonatito');
  const pongo = (await (await child.get('/api/media')).json()).items.find((m: { title: string }) => m.title === 'Pongo');
  expect((await child.post(`/api/media/${pongo.id}/play`)).ok()).toBeTruthy();

  await login(page, 'jonatito');
  // He sends "water, drink" to Mommy Joyce (a sent message is history; taps alone are not).
  await build(page, ['water', 'drink_f']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();
  // Abuela Pilar sends him a voice note; Mommy Joyce answers ✅.
  expect((await (await apiAs(request, 'pilar')).raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).ok()).toBeTruthy();
  const msg = (await (await joyce.get('/api/messages')).json())[0];
  await joyce.post(`/api/messages/${msg.id}/replies`, { kind: 'yes' });
  await page.reload(); // skip the arrival pop-ups; the strip is built from the server's history
  await expect(page.getByTestId('child-app')).toBeVisible();

  const hist = page.getByTestId('tl-hist');
  await expect.poll(async () => (await hist.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))).sort())
    .toEqual(['log', 'media', 'moment', 'reply', 'voice']);
  // Newest next to NOW (the ✅ or the voice note), the grapes from 1:10 furthest left; none overlap; none right of NOW.
  const now = (await page.getByTestId('now-marker').boundingBox())!;
  const boxes = await Promise.all((await hist.all()).map(async (h) => ({ kind: await h.getAttribute('data-kind'), b: (await h.boundingBox())! })));
  for (const { b } of boxes) expect(b.x + b.width / 2).toBeLessThanOrEqual(now.x + now.width / 2 + 1);
  const xs = boxes.map((o) => o.b.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(32);
  const log = boxes.find((o) => o.kind === 'log')!.b.x;
  expect(Math.min(...xs), JSON.stringify(boxes.map((o) => [o.kind, Math.round(o.b.x)]))).toBe(log);
  // Things are squares, people round.
  await expect(page.locator('[data-testid="tl-hist"][data-kind="media"]')).toHaveClass(/h-thing/);
  await expect(page.locator('[data-testid="tl-hist"][data-kind="reply"]')).toHaveClass(/h-face/);
  // The schedule strip no longer carries them.
  await expect(page.getByTestId('timeline').locator('[data-kind="moment"], [data-kind="voice"], [data-kind="media"]')).toHaveCount(0);
  await page.locator('[data-testid="tl-hist"][data-kind="log"]').click();
  await expect(page.getByTestId('entry-card')).toContainText('grapes');
});

test('taps he does not send do not go into history; every tap echoes big and flies off to the left', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-water').click();
  const fly = page.getByTestId('fly-away');
  await expect(fly).toHaveAttribute('data-id', 'water');
  await expect(fly).toHaveCount(0, { timeout: 4000 }); // gone after the animation
  await page.waitForTimeout(2500); // taps reach the server
  await page.reload();
  await expect(page.getByTestId('child-app')).toBeVisible();
  await expect(page.getByTestId('tl-hist')).toHaveCount(0);
});
