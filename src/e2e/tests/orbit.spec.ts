import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('the orbit is home: his core things in fixed inner slots, people in fixed outer slots', async ({ page }) => {
  await login(page, 'jonatito');
  const orbit = page.getByTestId('orbit');
  await expect(orbit).toHaveAttribute('data-parent', '');
  const slots: [string, number][] = [['eat', 0], ['bath', 1], ['toilet', 2], ['go', 3], ['barney', 4], ['pongo', 5], ['music', 6], ['water', 7]];
  for (const [id, slot] of slots) await expect(orbit.getByTestId(`orbit-${id}`)).toHaveAttribute('data-slot', String(slot));
  await expect(orbit.getByTestId('orbit-eat').locator('img')).toHaveAttribute('src', /\/api\/images\//); // the family's photo of grapes
  await expect(orbit.getByTestId('orbit-go')).toContainText('🚗');
  await expect(orbit.getByTestId('orbit-barney').locator('img')).toBeVisible();
  await expect(orbit.getByTestId('orbit-music')).toHaveAttribute('aria-label', 'Music');
  await expect(orbit.getByTestId('orbit-music')).not.toContainText('Music'); // pictures only: no word under them
  await expect(orbit.getByTestId('orbit-music').locator('img')).toHaveAttribute('src', /\/api\/images\//);
  // People: 12:00 and 6:00 stay empty.
  for (const [id, slot] of [['mommy_joyce', 1], ['lucho', 2], ['pilar', 3], ['larry', 4], ['tintin', 6]] as const) {
    await expect(orbit.getByTestId(`orbit-${id}`)).toHaveAttribute('data-slot', String(slot));
  }
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
  await expect(page.getByTestId('orbit-empty-0')).toBeVisible(); // water moved to the main orbit; its spot stays empty
  await expect(page.getByTestId('orbit-water')).toHaveCount(0);
  // People stay in the outer orbit, so the whole sentence is one screen.
  await expect(page.getByTestId('orbit-mommy_joyce')).toBeVisible();
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
  await expect(page.getByTestId('orbit-lucho')).toHaveAttribute('data-status', 'busy');
  await expect(page.getByTestId('busy-lucho').locator('svg.clock12')).toHaveAttribute('aria-label', '4:10');
  await expect(page.getByTestId('away-larry')).toHaveText('🚫');
  await expect(page.getByTestId('orbit-mommy_joyce').locator('.not-avail')).toHaveCount(0);
});

test('tapping a person in the orbit opens their person screen straight away', async ({ page, request }) => {
  await (await apiAs(request, 'pilar')).put('/api/location', { place_label: 'Lima', country_code: 'PE', tz: 'America/Lima', lat: -12.05, lon: -77.05 });
  await login(page, 'jonatito');
  await page.getByTestId('orbit-pilar').click();
  await expect(page.getByTestId('person-pilar')).toBeVisible();
  await expect(page.getByTestId('person-where')).toHaveAttribute('data-reach', 'abroad');
  await page.getByTestId('me-button').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(0); // visiting someone is not a word
});

test('Pongo plays full screen; his face brings him back', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-pongo').click();
  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'playing');
  await expect(page.getByTestId('player-poster').locator('img')).toBeVisible();
  await expect(page.getByTestId('player-clock')).toContainText('3:55');
  await expect(page.getByTestId('here-now')).toHaveCount(0);
  await page.getByTestId('player-exit').click();
  await expect(page.getByTestId('orbit')).toBeVisible();
});

test('at night Pongo shows the sleeping moon instead of playing', async ({ page, request }) => {
  await setClock(request, '2026-09-23T21:30:00-04:00', [page]);
  await login(page, 'jonatito');
  await page.getByTestId('orbit-pongo').click();
  await expect(page.getByTestId('player-locked')).toContainText('7:00');
});
