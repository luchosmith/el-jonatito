import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('his face opens the orbit: core actions close to him, people further out, taps go to the strip', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('me-button').click();
  const orbit = page.getByTestId('orbit');
  await expect(orbit.getByTestId('orbit-me')).toBeVisible();
  for (const [id, emoji] of [['eat', '🍇'], ['bath', '🛁'], ['toilet', '🚽'], ['go', '🚗']]) {
    await expect(orbit.getByTestId(`orbit-${id}`)).toContainText(emoji);
  }
  await expect(orbit.getByTestId('orbit-barney').locator('img')).toHaveAttribute('src', /barney/);
  await expect(orbit.getByTestId('orbit-pongo').locator('img')).toHaveAttribute('src', /pongo/);
  await expect(orbit.getByTestId('orbit-mommy_joyce')).toBeVisible();
  await expect(orbit.getByTestId('orbit-jonatito')).toHaveCount(0);

  // The bubbles float, so skip Playwright's "wait until still" check.
  await orbit.getByTestId('orbit-mommy_joyce').click({ force: true });
  await orbit.getByTestId('orbit-eat').click({ force: true });
  await expect(page.getByTestId('strip-me')).toBeVisible();
  await expect(page.getByTestId('strip-token')).toHaveCount(2);
  await expect(page.getByTestId('strip-token').nth(1)).toContainText('🍇');

  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-delivered')).toHaveAttribute('data-person', 'mommy_joyce');
});

test('Barney can go in a message from the orbit', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('me-button').click();
  await page.getByTestId('orbit-mommy_joyce').click({ force: true });
  await page.getByTestId('orbit-barney').click({ force: true });
  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-delivered')).toHaveAttribute('data-person', 'mommy_joyce');
  const inbox = await (await (await apiAs(request, 'joyce')).get('/api/messages')).json();
  expect(inbox[0].sentence_en).toContain('Barney');
});

test('people who are not available are marked in the orbit', async ({ page, request }) => {
  await (await apiAs(request, 'lucho')).put('/api/availability', { status: 'busy', until_minutes: 30 });
  await (await apiAs(request, 'larry')).put('/api/availability', { status: 'away' });
  await login(page, 'jonatito');
  await page.getByTestId('me-button').click();

  await expect(page.getByTestId('orbit-lucho')).toHaveAttribute('data-status', 'busy');
  await expect(page.getByTestId('orbit-lucho').locator('.not-avail')).toHaveText('⏳');
  await expect(page.getByTestId('orbit-larry')).toHaveAttribute('data-status', 'away');
  await expect(page.getByTestId('orbit-larry').locator('.not-avail')).toHaveText('🚫');
  await expect(page.getByTestId('orbit-mommy_joyce').locator('.not-avail')).toHaveCount(0);
});

test('tapping his face again goes back to the board, keeping the sentence', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('me-button').click();
  await page.getByTestId('orbit-go').click({ force: true });
  await page.getByTestId('me-button').click();
  await expect(page.getByTestId('orbit')).toHaveCount(0);
  await expect(page.getByTestId('grid')).toBeVisible();
  await expect(page.getByTestId('strip-token')).toHaveCount(1);
});
