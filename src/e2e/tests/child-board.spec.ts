import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, login, openBoard, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
  await login(page, 'jonatito');
  await openBoard(page);
});

test('the time row is only the timeline (no written time, date or chips) with his routine', async ({ page }) => {
  for (const id of ['digital-time', 'chip-day', 'chip-season', 'chip-weather']) await expect(page.getByTestId(id)).toHaveCount(0);
  // Lunch is done, media (4:00) is next; times are 12-hour.
  await expect(page.getByTestId('tl-lunch')).toHaveClass(/done/);
  await expect(page.getByTestId('tl-media')).toHaveClass(/next/);
  await expect(page.getByTestId('tl-dinner')).toContainText('6:30');
});

test('he builds a sentence from pictures and can clear it', async ({ page }) => {
  await build(page, ['grapes', 'eat_f']);
  await expect(page.getByTestId('strip-me')).toBeVisible();
  await expect(page.getByTestId('strip-token')).toHaveCount(2);
  await page.getByTestId('say').click();
  await page.getByTestId('clear').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(0);
  await expect(page.getByTestId('send')).toBeDisabled();
});

test('the sentence strip holds at most 6 pictures', async ({ page }) => {
  for (let i = 0; i < 8; i++) await page.getByTestId('sym-water').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(6);
});

test('the People page shows family with photos and pets, in fixed order', async ({ page }) => {
  await page.getByTestId('page-people').click();
  const joyce = page.getByTestId('sym-mommy_joyce');
  await expect(joyce).toHaveAttribute('data-slot', '0');
  await expect(joyce.locator('img')).toBeVisible();
  await expect(page.getByTestId('sym-lexi')).toContainText('Lexi (SLUT)');
  await expect(page.getByTestId('sym-jonatito')).toHaveCount(0);
});

test('yes / no / stop / help / I hurt stay visible on every page', async ({ page }) => {
  for (const p of ['food', 'action', 'feel', 'people']) {
    await page.getByTestId(`page-${p}`).click();
    for (const s of ['yes', 'no', 'stop', 'help', 'hurt']) await expect(page.getByTestId(`sym-${s}`)).toBeVisible();
  }
});

test('the two pastas are told apart by a sauce-colored badge', async ({ page }) => {
  await expect(page.getByTestId('sym-pasta_red').locator('.badge')).toHaveCSS('background-color', 'rgb(216, 57, 43)');
  await expect(page.getByTestId('sym-pasta_green').locator('.badge')).toHaveCSS('background-color', 'rgb(63, 155, 58)');
});

test('his own face is the Me button, family and pets sit in the dock', async ({ page }) => {
  await expect(page.getByTestId('me-button').locator('img')).toBeVisible();
  for (const id of ['mommy_joyce', 'lucho', 'pilar', 'larry', 'tintin', 'pongo', 'barney']) {
    await expect(page.getByTestId(`dock-${id}`)).toBeVisible();
  }
  for (const pet of ['lexi', 'loki', 'logan']) await expect(page.getByTestId(`dock-${pet}`)).toHaveCount(0); // saved for later, not in the dock
});

test('ice cream has the family photo on the Food page and can be asked for', async ({ page, request }) => {
  await expect(page.getByTestId('sym-ice_cream')).toHaveAttribute('data-slot', '8');
  await expect(page.getByTestId('sym-ice_cream').locator('img')).toHaveAttribute('src', /seed-item-ice_cream/);
  await build(page, ['ice_cream', 'eat_f']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('sentence')).toContainText('I want to eat ice cream.');
  const inbox = await (await (await apiAs(request, 'joyce')).get('/api/messages')).json();
  expect(inbox[0].sentence_es).toBe('Quiero comer helado.');
});

test('cookie has the family photo on the Food page and can be asked for', async ({ page, request }) => {
  await expect(page.getByTestId('sym-cookie')).toHaveAttribute('data-slot', '9');
  await expect(page.getByTestId('sym-cookie').locator('img')).toHaveAttribute('src', /seed-item-cookie/);
  await build(page, ['cookie', 'eat_f']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('sentence')).toContainText('I want to eat a cookie.');
  const inbox = await (await (await apiAs(request, 'joyce')).get('/api/messages')).json();
  expect(inbox[0].sentence_es).toBe('Quiero comer una galleta.');
});
