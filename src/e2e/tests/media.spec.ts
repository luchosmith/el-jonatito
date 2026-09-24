import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, login, resetDb, setClock } from './helpers.ts';

const NIGHT = '2026-09-23T21:00:00-04:00';

test.beforeEach(async ({ request }) => resetDb(request));

test('in the afternoon he picks a video and the media clock shows when it ends', async ({ page, request }) => {
  await setClock(request, AFTERNOON, [page]);
  await login(page, 'jonatito');
  await page.getByTestId('open-media').click();
  await expect(page.getByTestId('media-3').locator('img')).toBeVisible(); // generic cover art
  await page.getByTestId('media-1').click();
  await expect(page.getByTestId('media-playing')).toBeVisible();
  await expect(page.getByTestId('media-ends')).toHaveText('3:55');
  await expect(page.getByTestId('media-clock')).toHaveAttribute('aria-label', '3:55');
});

test('at night media sleeps (moon + clock for 7:00), but the bedtime playlist still plays', async ({ page, request }) => {
  await setClock(request, NIGHT, [page]);
  await login(page, 'jonatito');
  await page.getByTestId('open-media').click();
  await expect(page.getByTestId('media-1')).toHaveClass(/sleeping/);
  await expect(page.getByTestId('media-locked').locator('svg.clock12')).toHaveAttribute('aria-label', '7:00');

  await page.getByTestId('media-7').click(); // Calm rain (bedtime ok)
  await expect(page.getByTestId('media-playing')).toBeVisible();
});

test('the sleep lock is enforced by the server, not just the screen', async ({ request }) => {
  await setClock(request, NIGHT);
  const child = await apiAs(request, 'jonatito');
  const r = await child.post('/api/media/1/play');
  expect(r.status()).toBe(423);
  expect((await r.json()).unlock_at).toBe(new Date('2026-09-24T07:00:00-04:00').toISOString());
  await setClock(request, '2026-09-24T07:05:00-04:00');
  expect((await child.post('/api/media/1/play')).status()).toBe(200);
});
