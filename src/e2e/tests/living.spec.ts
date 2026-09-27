// v0.5: sentence row on top, NOW centred over his head, the sky, and dragging time.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, login, resetDb, setClock, TINY_JPEG } from './helpers.ts';

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
  // The timeline runs the full width of the screen.
  expect((await page.getByTestId('timeline').boundingBox())!.width).toBeGreaterThan(1200);
  // The clock is in the sky, under NOW, above his head: numbers and hands, no written time.
  const clock = (await page.getByTestId('main-clock').boundingBox())!;
  expect(Math.abs(clock.x + clock.width / 2 - (now.x + now.width / 2))).toBeLessThan(4);
  expect(clock.y).toBeGreaterThan(time.y + time.height - 4);
  expect(clock.y + clock.height).toBeLessThan(head.y);
  expect(clock.width).toBeGreaterThan(80);
  await expect(page.getByTestId('main-clock')).toHaveAttribute('aria-label', '3:40');
  await expect(page.getByTestId('main-clock').locator('text')).toHaveCount(12);
  await expect(page.getByTestId('digital-time')).toHaveCount(0);
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
  await page.mouse.move(line.x + line.width / 2 + 110, y, { steps: 5 });
  await page.mouse.move(line.x + line.width / 2 + 198, y, { steps: 5 }); // 198 px = 3 hours
  await page.mouse.up();
  await expect(page.getByTestId('here-now')).toHaveAttribute('data-away', 'yes');
  await expect(page.getByTestId('main-clock')).toHaveAttribute('aria-label', '12:40');
  await expect(page.locator('.orbit-layer')).toHaveClass(/away/);
  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('main-clock')).toHaveAttribute('aria-label', '3:40');
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

test('sleep is a block of bed pictures (no time) until 7:00; then the bath picture, then breakfast (smoothie) right after it', async ({ page, request }) => {
  await login(page, 'jonatito');
  const now = (await page.getByTestId('now-marker').boundingBox())!;
  const nowX = now.x + now.width / 2;
  const PX = 1.1; // px per minute
  // Tonight: 8:30 pm (290 min after 3:40) until 7:00 am (630 min), full-size beds, no time written.
  const sleep = page.getByTestId('tl-sleep');
  const sb = (await sleep.boundingBox())!;
  expect(Math.abs(sb.x - (nowX + 290 * PX))).toBeLessThan(3);
  expect(Math.abs(sb.width - 630 * PX)).toBeLessThan(3);
  expect(await sleep.locator('.tl-big').count()).toBeGreaterThanOrEqual(9);
  await expect(sleep).toHaveText('');
  // This morning: the bath picture starts on 7:00 (520 min before now), breakfast right after it.
  const wake = (await page.getByTestId('tl-wake').boundingBox())!;
  const breakfast = (await page.getByTestId('tl-breakfast').boundingBox())!;
  expect(Math.abs(wake.x - (nowX - 520 * PX))).toBeLessThan(3);
  expect(Math.abs(breakfast.x - (wake.x + wake.width))).toBeLessThan(2);
  const board = await (await (await apiAs(request, 'joyce')).get('/api/board')).json();
  const photo = (id: string) => board.items.find((i: { id: string }) => i.id === id).photo_url;
  await expect(page.getByTestId('tl-wake').locator('img')).toHaveAttribute('src', photo('bath'));
  await expect(page.getByTestId('tl-breakfast').locator('img')).toHaveAttribute('src', photo('smoothie'));
  await expect(page.getByTestId('tl-school')).toHaveCount(0);
});

test('an event with an end repeats its picture across its time', async ({ page, request, browser }) => {
  const joyce = await apiAs(request, 'joyce');
  const park = await (await joyce.post('/api/calendar', {
    title: 'Park with TinTin', emoji: '🌳', starts_at: '2026-09-23T14:00:00-04:00', ends_at: '2026-09-23T16:30:00-04:00', person_ids: ['tintin'],
  })).json();
  expect(park.ends_at).toBe('2026-09-23T20:30:00.000Z');
  expect((await joyce.post('/api/calendar', { title: 'x', starts_at: '2026-09-23T14:00:00-04:00', ends_at: '2026-09-23T13:00:00-04:00' })).status()).toBe(400);
  expect((await joyce.patch(`/api/calendar/${park.id}`, { ends_at: '2026-10-23T13:00:00-04:00' })).status()).toBe(400); // at most two weeks

  await login(page, 'jonatito');
  await expect(page.locator('[data-testid="tl-entry"][data-kind="event"]')).toHaveCount(1);
  expect(await page.getByTestId('tl-entry-more').count()).toBeGreaterThanOrEqual(2); // 150 min ≈ 165 px
  await page.getByTestId('tl-entry-more').first().click();
  await expect(page.getByTestId('entry-card')).toContainText('Park with TinTin');

  // Caretakers set "until" on 📅 Calendar.
  const phone = await device(browser, 'joyce', { clock: AFTERNOON });
  await phone.page.getByTestId('tab-calendar').click();
  await phone.page.getByTestId('cal-title').fill('Sleepover at Abuela’s');
  await phone.page.getByTestId('cal-date').fill('2026-09-25');
  await phone.page.getByTestId('cal-time').fill('18:00');
  await phone.page.getByTestId('cal-until').fill('09:00');
  await phone.page.getByTestId('cal-add').click();
  await expect(phone.page.getByTestId('cal-event').filter({ hasText: 'Sleepover' })).toContainText('6:00 pm – 9:00 am');
  await phone.context.close();
});
