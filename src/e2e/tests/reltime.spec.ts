// v0.9: relative time on his timeline; what's for breakfast (a pick per day); kinds of events.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiAs, device, login, resetDb, setClock, TINY_JPEG } from './helpers.ts';
import { timeOffsetPx } from '../../shared/timescale.ts';

const MORNING = '2026-09-23T07:05:00-04:00'; // Wednesday
const TODAY = '2026-09-23';
const TOMORROW = '2026-09-24';

/** Centre of an icon, in px from the timeline's left edge (where its time tick is drawn). */
async function centre(page: Page, el: Locator) {
  const line = (await page.getByTestId('timeline').boundingBox())!;
  const b = (await el.boundingBox())!;
  return b.x + b.width / 2 - line.x - 1; // 1 px border
}

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, MORNING, [page]);
});

test('at 7:05 the bath (7:30) sits on its tick, breakfast with the smoothie picture right after it, both with a "soon" clock', async ({ page, request }) => {
  await login(page, 'jonatito');
  const bath = page.getByTestId('tl-bath-450');
  const breakfast = page.getByTestId('tl-breakfast');
  await expect(bath).toBeVisible();
  const x0 = Number(await bath.getAttribute('data-x0'));
  expect(Math.abs((await centre(page, bath)) - x0)).toBeLessThan(2);
  // 7:30 is 25 minutes after NOW: in the "minutes" zone, right of the centre.
  const line = (await page.getByTestId('timeline').boundingBox())!;
  expect(Math.abs(x0 - ((line.width - 2) / 2 + timeOffsetPx(25, (line.width - 2) / 2)))).toBeLessThan(2);
  expect(await centre(page, breakfast)).toBeGreaterThan(await centre(page, bath));
  const smoothie = await (await (await apiAs(request, 'joyce')).get('/api/board')).json();
  const photo = smoothie.items.find((i: { id: string }) => i.id === 'smoothie').photo_url;
  await expect(breakfast.locator('img')).toHaveAttribute('src', photo);
  await expect(bath.getByTestId('tl-soon')).toHaveText('25′');
  await expect(breakfast.getByTestId('tl-soon')).toHaveText('40′');
  // Last night: a band full of little beds.
  await expect(page.getByTestId('tl-night').first()).toBeVisible();
  expect(await page.getByTestId('tl-bed').count()).toBeGreaterThan(3);
  // Tap breakfast: its picture, and "in 40 min".
  await breakfast.click();
  await expect(page.getByTestId('entry-card')).toHaveAttribute('data-kind', 'routine');
  await expect(page.getByTestId('entry-when')).toHaveText('in 40 min');
  await page.screenshot({ path: 'test-results/reltime-morning.png' });
});

test('a caretaker picks eggs for tomorrow on 🗓️ His day; today stays the smoothie; a photo for today only; back to the usual', async ({ page, browser, request }) => {
  const joyce = await device(browser, 'joyce', { clock: MORNING });
  await joyce.page.getByTestId('tab-plan').click();
  await expect(joyce.page.getByTestId('plan-day-1')).toHaveClass(/on/); // opens on tomorrow
  await joyce.page.getByTestId('pick-breakfast-eggs').click();
  await expect(joyce.page.getByTestId('pick-breakfast-eggs')).toHaveClass(/sel/);
  const api = await apiAs(request, 'joyce');
  const days = await (await api.get('/api/schedule/days')).json();
  expect(days).toEqual([expect.objectContaining({ day: TOMORROW, item_id: 'eggs', set_by: 'Mommy Joyce' })]);

  await login(page, 'jonatito');
  const breakfast = page.getByTestId('tl-breakfast');
  await expect(breakfast).not.toHaveClass(/picked/); // today: the usual smoothie
  await expect(breakfast.locator('img')).toBeVisible();

  // Today, a custom photo (for today only) shows on his tablet right away.
  const schedule = await (await api.get('/api/schedule')).json();
  const id = schedule.find((s: { label: string }) => s.label === 'breakfast').id;
  expect((await api.raw('PUT', `/api/schedule/${id}/days/${TODAY}/image`, TINY_JPEG, 'image/jpeg')).ok()).toBeTruthy();
  await expect(breakfast).toHaveClass(/picked/);
  await expect(breakfast.locator('img')).toHaveAttribute('src', /\/api\/images\//);
  expect((await api.del(`/api/schedule/${id}/days/${TODAY}`)).ok()).toBeTruthy();
  await expect(breakfast).not.toHaveClass(/picked/);

  // Only caretakers, only his foods, real days.
  const pilar = await apiAs(request, 'pilar');
  expect((await pilar.put(`/api/schedule/${id}/days/${TODAY}`, { item_id: 'eggs' })).status()).toBe(403);
  expect((await api.put(`/api/schedule/${id}/days/${TODAY}`, { item_id: 'bath' })).status()).toBe(400);
  expect((await api.put(`/api/schedule/${id}/days/tomorrow`, { item_id: 'eggs' })).status()).toBe(400);
  await joyce.context.close();
});

test('events start from a kind with a default picture; the family can set its own default; one event can use its own photo', async ({ page, request }) => {
  const api = await apiAs(request, 'joyce');
  const doctor = await (await api.post('/api/calendar', { template: 'doctor', starts_at: '2026-09-29T11:00:00-04:00', person_ids: ['mommy_joyce'] })).json();
  expect(doctor).toMatchObject({ title: 'Doctor', emoji: '🩺', template: 'doctor', photo_url: null });
  const templates = await (await api.raw('PUT', '/api/calendar/templates/doctor/image', TINY_JPEG, 'image/jpeg')).json();
  const def = templates.find((t: { id: string }) => t.id === 'doctor').photo_url;
  expect(def).toMatch(/\/api\/images\//);
  const cal = await (await api.get('/api/calendar')).json();
  expect(cal[0].photo_url).toBe(def);
  const own = await (await api.raw('PUT', `/api/calendar/${doctor.id}/image`, TINY_JPEG, 'image/jpeg')).json();
  expect(own.photo_url).not.toBe(def);
  expect((await (await apiAs(request, 'pilar')).raw('PUT', '/api/calendar/templates/doctor/image', TINY_JPEG, 'image/jpeg')).status()).toBe(403);
  expect((await api.raw('PUT', '/api/calendar/templates/nope/image', TINY_JPEG, 'image/jpeg')).status()).toBe(404);
  const reverted = await (await api.del('/api/calendar/templates/doctor/image')).json();
  expect(reverted.find((t: { id: string }) => t.id === 'doctor').photo_url).toBeNull();

  // A play date next week, shown right away: on the right (days), and dragging far right reaches it.
  await api.post('/api/calendar', { template: 'playdate', starts_at: '2026-09-29T15:00:00-04:00', person_ids: ['tintin'], show_from_min: 366 * 1440 });
  await login(page, 'jonatito');
  const events = page.locator('[data-testid="tl-entry"][data-kind="event"]');
  await expect(events).toHaveCount(1); // the doctor shows from the day before (its own setting)
  const line = (await page.getByTestId('timeline').boundingBox())!;
  for (const e of await events.all()) expect(await centre(page, e)).toBeGreaterThan((line.width * 2) / 3);
  const sixDays = timeOffsetPx(6 * 1440, (line.width - 2) / 2);
  const y = line.y + line.height - 6;
  await page.mouse.move(line.x + line.width / 2 + sixDays / 2, y);
  await page.mouse.down();
  await page.mouse.move(line.x + line.width / 2 - sixDays / 2, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('chip-day')).toContainText('Tuesday');
  await page.screenshot({ path: 'test-results/reltime-next-week.png' });
});

test('a caretaker adds a play date from a kind on 📅 Calendar (no title needed)', async ({ browser }) => {
  const joyce = await device(browser, 'joyce', { clock: MORNING });
  await joyce.page.getByTestId('tab-calendar').click();
  await joyce.page.getByTestId('cal-tpl-playdate').click();
  await joyce.page.getByTestId('cal-date').fill('2026-09-26');
  await joyce.page.getByTestId('cal-time').fill('15:00');
  await joyce.page.getByTestId('cal-person-tintin').click();
  await joyce.page.getByTestId('cal-add').click();
  await expect(joyce.page.getByTestId('cal-event')).toHaveCount(1);
  await expect(joyce.page.getByTestId('cal-event')).toContainText('Play date');
  await joyce.context.close();
});
