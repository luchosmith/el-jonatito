import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('the orbit is home: his core things in fixed inner slots; people are on the globe and in the taskbar, not the orbit', async ({ page }) => {
  await login(page, 'jonatito');
  const orbit = page.getByTestId('orbit');
  await expect(orbit).toHaveAttribute('data-parent', '');
  const slots: [string, number][] = [['eat', 0], ['toilet', 1], ['music', 6], ['water', 7]];
  for (const [id, slot] of slots) await expect(orbit.getByTestId(`orbit-${id}`)).toHaveAttribute('data-slot', String(slot));
  await expect(orbit.getByTestId('orbit-bath')).toHaveCount(0); // Bath left the orbit (still on the board); Toilet took its spot
  await expect(orbit.getByTestId('orbit-empty-2')).toBeVisible();
  await expect(orbit.getByTestId('orbit-eat').locator('img')).toHaveAttribute('src', /\/api\/images\//); // the family's photo of grapes
  await expect(orbit.getByTestId('orbit-go')).toHaveCount(0); // Go left the orbit (still on the board)
  await expect(orbit.getByTestId('orbit-empty-3')).toBeVisible();
  // Pongo and Barney moved to the dock; their spots stay empty (nothing shifts).
  await expect(orbit.getByTestId('orbit-empty-4')).toBeVisible();
  await expect(orbit.getByTestId('orbit-empty-5')).toBeVisible();
  await expect(orbit.getByTestId('orbit-pongo')).toHaveCount(0);
  await expect(page.getByTestId('dock-barney').locator('img')).toBeVisible();
  await expect(orbit.getByTestId('orbit-music')).toHaveAttribute('aria-label', 'Music');
  await expect(orbit.getByTestId('orbit-music')).not.toContainText('Music'); // pictures only: no word under them
  await expect(orbit.getByTestId('orbit-music').locator('img')).toHaveAttribute('src', /\/api\/images\//);
  for (const id of ['mommy_joyce', 'lucho', 'pilar', 'larry', 'tintin']) {
    await expect(orbit.getByTestId(`orbit-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`dock-${id}`)).toBeVisible();
  }
  // The places compass on the earth: home in the middle; pets as small pictures next to it.
  await expect(page.getByTestId('compass-home')).toContainText('HOME · New York');
  await expect(page.getByTestId('compass-pet-lexi')).toBeVisible();
  await expect(orbit.getByTestId('orbit-jonatito')).toHaveCount(0);
  await expect(page.getByTestId('sky')).toBeVisible(); // the earth, sun and moon are drawn on the canvas
});

test('tapping builds the sentence; Eat opens the foods around him and his face goes back', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-eat').click();
  await expect(page.getByTestId('orbit')).toHaveAttribute('data-parent', 'eat');
  await expect(page.getByTestId('orbit-parent').locator('img')).toBeVisible();
  await expect(page.getByTestId('orbit-grapes').locator('img')).toHaveAttribute('src', /grapes/);
  await expect(page.getByTestId('orbit-grapes')).toHaveAttribute('data-slot', '4');
  await expect(page.getByTestId('orbit-empty-0')).toHaveCount(0); // a cloud shows no empty spots (water's old spot stays free)
  // The foods are a cloud of 10 spots: cookie and ice cream too; none touch each other, his face or the clock.
  await expect(page.getByTestId('orbit-cookie')).toHaveAttribute('data-slot', '8');
  await expect(page.getByTestId('orbit-ice_cream')).toHaveAttribute('data-slot', '9');
  const spots = [...await page.locator('[data-testid^="orbit-"].orb').all(), page.getByTestId('orbit-me'), page.getByTestId('main-clock')];
  const boxes = await Promise.all(spots.map((l) => l.boundingBox()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    const d = Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
    expect(d, `spots ${i} and ${j}`).toBeGreaterThan(a.width / 2 + b.width / 2);
  }
  await expect(page.getByTestId('orbit-water')).toHaveCount(0);
  // The sky and the globe fade behind a veil, only in the main area (not over the timeline or the taskbar).
  const veil = (await page.getByTestId('sub-veil').boundingBox())!;
  const area = (await page.getByTestId('orbit').boundingBox())!;
  expect(veil).toEqual(area);
  expect(veil.y).toBeGreaterThanOrEqual((await page.getByTestId('here-now').boundingBox())!.y + (await page.getByTestId('here-now').boundingBox())!.height - 1);
  expect(veil.y + veil.height).toBeLessThanOrEqual((await page.getByTestId('dock').boundingBox())!.y + 1);
  await expect(page.getByTestId('compass-home')).toBeVisible(); // still there, just faded
  await page.getByTestId('orbit-grapes').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(2);

  // No person picked: it goes to the caretaker on duty.
  await page.getByTestId('send').click();
  await expect(page.getByTestId('sentence')).toContainText('I want to eat grapes.');
  await page.getByTestId('card-ok').click();
  const inbox = await (await (await apiAs(request, 'joyce')).get('/api/messages')).json();
  expect(inbox[0].sentence_es).toBe('Quiero comer uvas.');

  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('orbit')).toHaveAttribute('data-parent', '');
  await expect(page.getByTestId('sub-veil')).toHaveCount(0);
});

test('Toilet opens its own cloud: wee wee, toilet paper and the shower; the sky fades behind a veil', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-toilet').click();
  await expect(page.getByTestId('orbit')).toHaveAttribute('data-parent', 'toilet');
  await expect(page.getByTestId('sub-veil')).toBeVisible();
  for (const [id, slot] of [['bath', 0], ['toilet_paper', 2], ['wee_wee', 4]] as const) {
    await expect(page.getByTestId(`orbit-${id}`)).toHaveAttribute('data-slot', String(slot));
    await expect(page.getByTestId(`orbit-${id}`).locator('img')).toHaveAttribute('src', /\/api\/images\//);
  }
  // All three on the right, together (in the bathroom they are next to each other).
  const me = (await page.getByTestId('orbit-me').boundingBox())!;
  for (const id of ['wee_wee', 'toilet_paper', 'bath']) expect((await page.getByTestId(`orbit-${id}`).boundingBox())!.x).toBeGreaterThan(me.x + me.width / 2);
  await expect(page.getByTestId('orbit-parent').locator('img')).toBeVisible(); // the toilet photo, to go back
  await page.getByTestId('orbit-wee_wee').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(2);
  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('orbit')).toHaveAttribute('data-parent', '');
});

test('foods outside their time are dimmed with a clock and are not added', async ({ page }) => {
  // 3:40 pm: grapes are open (snack 3:00 for 45 min); pancakes only at breakfast.
  await login(page, 'jonatito');
  await page.getByTestId('orbit-eat').click();
  await expect(page.getByTestId('orbit-grapes')).toHaveAttribute('data-closed', '');
  const pancakes = page.getByTestId('orbit-pancakes');
  await expect(pancakes).toHaveClass(/closed/);
  await expect(pancakes.locator('svg.clock12')).toHaveAttribute('aria-label', '7:00');
  await expect(page.getByTestId('next-open')).toContainText('7:00');

  await pancakes.click();
  await expect(page.getByTestId('closed-tip')).toContainText('7:00');
  await expect(page.getByTestId('strip-token')).toHaveCount(1); // only "eat"
});

test('a daily limit closes the item until tomorrow and suggests something else', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  for (const at of ['2026-09-23T09:00:00-04:00', '2026-09-23T13:00:00-04:00']) {
    await joyce.post('/api/logs', { type: 'drink', symbol_id: 'smoothie', at });
  }
  await login(page, 'jonatito');
  await page.getByTestId('orbit-eat').click();
  await expect(page.getByTestId('orbit-smoothie')).toHaveClass(/closed/);
  await page.getByTestId('orbit-smoothie').click();
  await expect(page.getByTestId('closed-suggest').locator('img')).toHaveAttribute('src', /seed-item-water/); // the family's water bottle
});

test('the snack window opens by itself when snack time comes', async ({ page, request }) => {
  await setClock(request, '2026-09-23T14:59:00-04:00', [page]);
  await login(page, 'jonatito');
  await page.getByTestId('orbit-eat').click();
  await expect(page.getByTestId('orbit-grapes')).toHaveClass(/closed/);
  await setClock(request, '2026-09-23T15:01:00-04:00', [page]);
  // The tablet's clock ticks every 15 s and notices the snack has started.
  await expect(page.getByTestId('orbit-grapes')).not.toHaveClass(/closed/, { timeout: 20_000 });
});

test('people who are not available are marked: a clock of when they are free, or 🚫', async ({ page, request }) => {
  await (await apiAs(request, 'lucho')).put('/api/availability', { status: 'busy', until_minutes: 30 });
  await (await apiAs(request, 'larry')).put('/api/availability', { status: 'away' });
  await login(page, 'jonatito');
  await expect(page.getByTestId('dock-lucho')).toHaveAttribute('data-status', 'busy');
  await expect(page.getByTestId('busy-lucho').locator('svg.clock12')).toHaveAttribute('aria-label', '4:10');
  await expect(page.getByTestId('away-larry')).toHaveText('🚫');
  await expect(page.getByTestId('dock-mommy_joyce').locator('.dk-status')).toHaveCount(0);
});

test('people are on the globe where they are (near home in the middle, far away at the edges); tapping a face opens their page', async ({ page, request }) => {
  await (await apiAs(request, 'pilar')).put('/api/location', { place_label: 'Lima', country_code: 'PE', tz: 'America/Lima', lat: -12.05, lon: -77.05 });
  await (await apiAs(request, 'joyce')).put('/api/location', { place_label: 'Newark', country_code: 'US', tz: 'America/New_York', lat: 40.74, lon: -74.17 });
  await login(page, 'jonatito');
  const pilar = page.getByTestId('compass-pilar');
  const joyce = page.getByTestId('compass-mommy_joyce');
  await expect(page.getByTestId('compass-tintin')).toHaveCount(0); // not shared: not on the globe
  const px = Number(await pilar.getAttribute('data-x'));
  const jx = Number(await joyce.getAttribute('data-x'));
  expect(px).toBeLessThan(25); // Lima: past the ✈️ line, to the west (left)
  expect(Math.abs(jx - 50)).toBeLessThan(Math.abs(px - 50)); // Newark: much nearer home
  await pilar.click();
  await expect(page.getByTestId('person-pilar')).toBeVisible();
  await expect(page.getByTestId('person-where')).toHaveAttribute('data-reach', 'abroad');
  await page.getByTestId('me-button').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(0); // visiting someone is not a word
});

test('Pongo (in the dock) plays full screen; his face brings him back', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-pongo').click();
  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByTestId('player-poster').locator('img')).toBeVisible();
  await expect(page.getByTestId('player-clock')).toContainText('3:55');
  await expect(page.getByTestId('here-now')).toHaveCount(0);
  await page.getByTestId('player-exit').click();
  await expect(page.getByTestId('orbit')).toBeVisible();
});

test('Pongo with a film: full screen until bedtime; a tap pauses and goes on; his face (bottom-left) goes home; it goes on where he left it; it loops', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  const pongo = (await (await joyce.get('/api/media')).json()).items.find((m: { title: string }) => m.title === 'Pongo');
  const film = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'film.webm'));
  expect((await joyce.raw('PUT', `/api/media/${pongo.id}/file`, film, 'video/webm')).ok()).toBeTruthy();

  await login(page, 'jonatito');
  await page.getByTestId('dock-pongo').click();
  const video = page.getByTestId('player-video');
  await expect(page.getByTestId('player-clock')).toContainText('8:30'); // until bedtime, not a 15-minute session
  expect(await video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5)).toBe(true);
  const box = (await page.getByTestId('player').boundingBox())!;
  const vb = (await video.boundingBox())!;
  expect(vb.width).toBeGreaterThan(box.width - 2); // the whole screen
  const home = (await page.getByTestId('player-exit').boundingBox())!;
  expect(home.x).toBeLessThan(box.x + 40); // bottom-left, where his face is in the taskbar
  expect(home.y + home.height).toBeGreaterThan(box.y + box.height - 40);

  await page.getByTestId('player-film').click({ position: { x: box.width / 2, y: box.height / 3 } });
  await expect(page.getByTestId('player-film')).toHaveAttribute('data-paused', 'yes');
  await expect(page.getByTestId('player-paused')).toBeVisible();
  const at = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.getByTestId('player-film').click({ position: { x: box.width / 2, y: box.height / 3 } });
  await expect(page.getByTestId('player-film')).toHaveAttribute('data-paused', 'no');

  // Home, then Pongo again: it goes on from where he left it.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(at + 0.5);
  await page.getByTestId('player-exit').click();
  await expect(page.getByTestId('orbit')).toBeVisible();
  const saved = Number(await page.evaluate((k) => localStorage.getItem(k), `jt-media-pos-${pongo.id}`));
  expect(saved).toBeGreaterThan(at);
  await page.getByTestId('dock-pongo').click();
  await expect.poll(() => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(saved - 0.3);
});

test('at night Pongo shows the sleeping moon instead of playing', async ({ page, request }) => {
  await setClock(request, '2026-09-23T21:30:00-04:00', [page]);
  await login(page, 'jonatito');
  await page.getByTestId('dock-pongo').click();
  await expect(page.getByTestId('player-locked')).toContainText('7:00');
});

test('Barney in the dock adds "Barney" to the sentence', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-barney').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(1);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('sentence')).toContainText('I want Barney.');
  const inbox = await (await (await apiAs(request, 'joyce')).get('/api/messages')).json();
  expect(inbox[0].sentence_en).toBe('I want Barney.');
});

test('relative distance on the globe: at home by the bed, a short drive just past the 🚗, abroad past the ✈️', async ({ page, request }) => {
  const at = async (u: string, place: string, cc: string, tz: string, lat: number, lon: number) =>
    (await apiAs(request, u)).put('/api/location', { place_label: place, country_code: cc, tz, lat, lon });
  await at('joyce', 'Home', 'US', 'America/New_York', 40.71, -74.01);
  await at('lucho', 'Jersey City', 'US', 'America/New_York', 40.72, -74.08);
  await at('pilar', 'Madrid', 'ES', 'Europe/Madrid', 40.4, -3.68);
  await at('larry', 'Madrid', 'ES', 'Europe/Madrid', 40.4, -3.68);
  await login(page, 'jonatito');
  await expect(page.getByTestId('compass-mommy_joyce')).toHaveAttribute('data-home', 'yes');
  const lucho = Number(await page.getByTestId('compass-lucho').getAttribute('data-x'));
  expect(lucho).toBeLessThan(41); // past the left 🚗 line (41%)
  expect(lucho).toBeGreaterThan(33); // but close to it
  const pilar = Number(await page.getByTestId('compass-pilar').getAttribute('data-x'));
  const larry = Number(await page.getByTestId('compass-larry').getAttribute('data-x'));
  expect(pilar).toBeGreaterThan(79); // past the right ✈️ line (79%)
  expect(Math.abs(larry - pilar)).toBeLessThan(3); // side by side
});
