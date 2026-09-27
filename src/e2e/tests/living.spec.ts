// v0.5: sentence row on top, NOW centred over his head, the sky, and dragging time.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, login, resetDb, setClock, TINY_JPEG } from './helpers.ts';
import { timeOffsetPx } from '../../shared/timescale.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('the sentence row is on top, the time row under it, and NOW is in line with his head', async ({ page }) => {
  await login(page, 'jonatito');
  const strip = (await page.getByTestId('strip').boundingBox())!;
  const time = (await page.getByTestId('here-now').boundingBox())!;
  expect(strip.y).toBeLessThan(time.y);
  const now = (await page.getByTestId('now-marker').boundingBox())!;
  const head = (await page.getByTestId('orbit-me').boundingBox())!;
  expect(Math.abs(now.x + now.width / 2 - (head.x + head.width / 2))).toBeLessThan(4);
  const sky = (await page.getByTestId('sky').boundingBox())!;
  expect(sky.width).toBeGreaterThan(800);
  // Today's routine is still on the line (lunch done, media next).
  await expect(page.getByTestId('tl-lunch')).toHaveClass(/done/);
  await expect(page.getByTestId('tl-media')).toHaveClass(/next/);
});

test('dragging the timeline goes back in time; the orbit dims; his face brings him back', async ({ page }) => {
  await login(page, 'jonatito');
  const line = (await page.getByTestId('timeline').boundingBox())!;
  const y = line.y + line.height - 10;
  await page.mouse.move(line.x + line.width / 2, y);
  await page.mouse.down();
  const threeHours = timeOffsetPx(180, (line.width - 2) / 2); // the scale is not linear: 3 hours is in the "hours" zone
  await page.mouse.move(line.x + line.width / 2 + threeHours / 2, y, { steps: 5 });
  await page.mouse.move(line.x + line.width / 2 + threeHours, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('here-now')).toHaveAttribute('data-away', 'yes');
  await expect(page.getByTestId('digital-time')).toHaveText(/^12:(39|40|41) PM$/);
  await expect(page.locator('.orbit-layer')).toHaveClass(/away/);
  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('digital-time')).toHaveText('3:40 PM');
  await expect(page.getByTestId('here-now')).toHaveAttribute('data-away', 'no');
  await expect(page.getByTestId('body-view')).toHaveCount(0); // it went back to now, not into My body
});

test('left alone, it springs back to NOW after a few seconds', async ({ page }) => {
  await login(page, 'jonatito');
  const line = (await page.getByTestId('timeline').boundingBox())!;
  const y = line.y + line.height - 10;
  await page.mouse.move(line.x + line.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(line.x + line.width / 2 - 150, y, { steps: 5 }); // into the future
  await page.mouse.up();
  await expect(page.getByTestId('here-now')).toHaveAttribute('data-away', 'yes');
  await expect(page.getByTestId('here-now')).toHaveAttribute('data-away', 'no', { timeout: 12_000 });
});

test('the past shows what happened (a photo from his day); the future only what is scheduled', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  const photo = await (await joyce.post('/api/calendar', { title: 'The park', kind: 'photo', starts_at: '2026-09-23T14:30:00-04:00', person_ids: ['pilar'] })).json();
  expect((await joyce.raw('PUT', `/api/calendar/${photo.id}/image`, TINY_JPEG, 'image/jpeg')).ok()).toBeTruthy();
  await joyce.post('/api/calendar', { title: 'Dentist', emoji: '🦷', starts_at: '2026-09-24T10:00:00-04:00', person_ids: ['mommy_joyce'], show_from_min: 1440 });
  await joyce.post('/api/calendar', { title: 'Surprise party', emoji: '🎂', starts_at: '2026-09-30T15:00:00-04:00', show_from_min: 1440 });

  await login(page, 'jonatito');
  await expect(page.locator('[data-testid="tl-entry"][data-kind="event"]')).toHaveCount(1); // the party is not shown yet
  const past = page.locator('[data-testid="tl-entry"][data-kind="photo"]');
  await past.click();
  await expect(page.getByTestId('entry-card')).toHaveAttribute('data-kind', 'photo');
  await expect(page.getByTestId('entry-photo')).toHaveAttribute('src', /\/api\/images\//);
  await expect(page.getByTestId('entry-card')).toContainText('The park');
});

test('caretakers add an event from the 📅 Calendar tab; it appears on his timeline', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-calendar').click();
  await joyce.page.getByTestId('cal-title').fill('Abuela Pilar comes home');
  await joyce.page.getByTestId('cal-date').fill('2026-09-24');
  await joyce.page.getByTestId('cal-time').fill('12:00');
  await joyce.page.getByTestId('cal-emoji').fill('✈️');
  await joyce.page.getByTestId('cal-person-pilar').click();
  await joyce.page.getByTestId('cal-add').click();
  await expect(joyce.page.getByTestId('cal-event')).toHaveCount(1);
  await expect(page.locator('[data-testid="tl-entry"][data-kind="event"]')).toHaveCount(1);
  const pilarApi = await apiAs(joyce.page.request, 'pilar');
  expect((await pilarApi.post('/api/calendar', { title: 'x', starts_at: '2026-09-24T12:00:00Z' })).status()).toBe(403);
  await joyce.context.close();
});
