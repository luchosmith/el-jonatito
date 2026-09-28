// v0.9: on duty. A caretaker who is with him (Where I am = home) can be on duty: their face circles
// his on the tablet, and his messages go to them too, next to the person he chose.
import { expect, test, type Locator } from '@playwright/test';
import { AFTERNOON, apiAs, build, device, login, resetDb, setClock } from './helpers.ts';

const HOME = { place_label: 'Home', country_code: 'US', tz: 'America/New_York', lat: 40.71, lon: -74.01 };
const JERSEY_CITY = { place_label: 'Jersey City', country_code: 'US', tz: 'America/New_York', lat: 40.72, lon: -74.08 };

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

const overlaps = async (a: Locator, b: Locator) => {
  const x = (await a.boundingBox())!;
  const y = (await b.boundingBox())!;
  const d = Math.hypot(x.x + x.width / 2 - (y.x + y.width / 2), x.y + x.height / 2 - (y.y + y.height / 2));
  return d < x.width / 2 + y.width / 2 - 2;
};

test('on duty only when with him; the face circles his; messages go to them too; leaving ends it', async ({ page, browser, request }) => {
  const lucho = await apiAs(request, 'lucho');
  await lucho.put('/api/location', JERSEY_CITY);
  const phone = await device(browser, 'lucho', { clock: AFTERNOON });
  await phone.page.getByTestId('tab-status').click();
  await phone.page.getByTestId('status-on_duty').click();
  await expect(phone.page.getByTestId('status-msg')).toContainText('with Jonatito');
  expect((await (await apiAs(request, 'pilar')).put('/api/availability', { status: 'on_duty' })).status()).toBe(403); // caretakers only

  // Home with him: on duty.
  await lucho.put('/api/location', HOME);
  await phone.page.getByTestId('status-on_duty').click();
  await expect(phone.page.getByTestId('status-current')).toHaveText('Now: on duty');

  await login(page, 'jonatito');
  const face = page.getByTestId('duty-lucho');
  await expect(face).toBeVisible();
  await expect(page.getByTestId('compass-lucho')).toHaveCount(0); // not on the globe while he circles Jonatito
  await expect(page.getByTestId('duty-badge-lucho')).toBeVisible();
  // Same size as on the globe; hovering just off his face at about 4 o'clock (it does not circle); clear of everything else.
  const f = (await face.boundingBox())!;
  const me = (await page.getByTestId('orbit-me').boundingBox())!;
  expect(Math.round(f.width)).toBe(68);
  const dx = f.x + f.width / 2 - (me.x + me.width / 2);
  const dy = f.y + f.height / 2 - (me.y + me.height / 2);
  expect(dx).toBeGreaterThan(0); // right
  expect(dy).toBeGreaterThan(0); // and below: 4 to 5 o'clock
  expect(Math.hypot(dx, dy)).toBeLessThan(me.width / 2 + f.width / 2 + 16); // close to him
  for (const id of ['orbit-me', 'main-clock', 'orbit-water', 'orbit-eat', 'orbit-toilet', 'compass-home']) expect(await overlaps(face, page.getByTestId(id)), id).toBe(false);

  // A message with no name goes to him (one to someone he picks goes to both: see test/dispatcher.test.ts).
  await build(page, ['water', 'drink_f']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();
  await expect(phone.page.getByTestId('notify-banner')).toContainText('I want to drink water.');
  const msgs = await (await lucho.get('/api/messages')).json();
  expect(msgs).toHaveLength(1);

  // He leaves: on duty ends by itself, and his face goes back to the globe.
  await page.getByTestId('me-button').click(); // back to the orbit
  await expect(face).toBeVisible();
  await lucho.put('/api/location', JERSEY_CITY);
  await expect(face).toHaveCount(0);
  await expect(page.getByTestId('duty-badge-lucho')).toHaveCount(0);
  await expect(page.getByTestId('compass-lucho')).toBeVisible();
  await phone.context.close();
});
