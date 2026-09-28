// Parent mode -> Items: the catalog editor. Changes reach the tablet live.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, FAKE_WEBM, login, resetDb, setClock, TINY_JPEG } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

async function openItem(browser: import('@playwright/test').Browser, id: string) {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-items').click();
  await joyce.page.getByTestId(`item-row-${id}`).click();
  await expect(joyce.page.getByTestId('item-editor')).toHaveAttribute('data-id', id);
  return joyce;
}

test('renaming Toilet in the editor changes the orbit label; the spoken words stay separate', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await openItem(browser, 'toilet');
  await expect(joyce.page.getByTestId('item-label-en')).toHaveValue('go to the toilet');
  await joyce.page.getByTestId('item-short').fill('Potty');
  await joyce.page.getByTestId('item-label-es').fill('al bañito');
  await joyce.page.getByTestId('item-save-words').click();
  await expect(page.getByTestId('orbit-toilet')).toHaveAttribute('aria-label', 'Potty'); // the name is not shown to him, only kept
  await expect(page.getByTestId('orbit-toilet')).toHaveAttribute('data-slot', '1');
  await joyce.context.close();
});

test('a new picture, then one-tap revert', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await openItem(browser, 'toilet');
  const img = page.getByTestId('orbit-toilet').locator('img');
  await expect(img).toHaveAttribute('src', /seed-item-toilet/); // the family's photo from the seed
  await joyce.page.getByTestId('item-photo').setInputFiles({ name: 'toilet.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG });
  await expect(img).not.toHaveAttribute('src', /seed-item-toilet/);
  await expect(joyce.page.getByTestId('item-history').locator('span')).toHaveCount(2);
  await joyce.page.getByTestId('item-revert').click();
  await expect(img).toHaveAttribute('src', /seed-item-toilet/); // back to the previous picture
  await joyce.context.close();
});

test('a recorded word plays when he taps; "text-to-speech" goes back to the computer voice', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await openItem(browser, 'music');
  const row = joyce.page.getByTestId('item-audio-en');
  await expect(row).toHaveAttribute('data-state', 'tts');
  await joyce.page.getByTestId('item-audio-en-upload').setInputFiles({ name: 'go.webm', mimeType: 'audio/webm', buffer: FAKE_WEBM });
  await expect(row).toHaveAttribute('data-state', 'recorded');

  const played = page.waitForRequest((r) => r.url().includes('/api/audio/'));
  await page.getByTestId('orbit-music').click();
  await played;

  await joyce.page.getByTestId('item-audio-en-tts').click();
  await expect(row).toHaveAttribute('data-state', 'tts');
  await joyce.context.close();
});

test('a time rule added in the editor closes the item on the tablet, with its clock', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await openItem(browser, 'toilet');
  await joyce.page.getByTestId('rule-kind').selectOption('window');
  await joyce.page.getByTestId('rule-start').fill('19:00');
  await joyce.page.getByTestId('rule-end').fill('20:00');
  await joyce.page.getByTestId('rule-add').click();
  await expect(joyce.page.getByTestId('item-closed')).toBeVisible();
  await expect(page.getByTestId('orbit-toilet')).toHaveClass(/closed/);
  await expect(page.getByTestId('orbit-toilet').locator('svg.clock12')).toHaveAttribute('aria-label', '7:00');

  // "Reminder only" keeps it open.
  const blocks = joyce.page.locator('[data-testid^="rule-blocks-"]');
  await blocks.click(); // saved on the server first, then shown
  await expect(blocks).not.toBeChecked();
  await expect(page.getByTestId('orbit-toilet')).not.toHaveClass(/closed/);
  await joyce.context.close();
});

test('moving an item asks first, lands in the chosen empty slot, and taken slots cannot be picked', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await openItem(browser, 'music');
  await expect(joyce.page.getByTestId('item-slot-0')).toBeDisabled(); // Eat lives there
  let asked = '';
  joyce.page.on('dialog', (d) => {
    asked = d.message();
    void d.accept();
  });
  // The main orbit is full; the first spot in Eat's orbit is free (water moved out of it).
  await joyce.page.getByTestId('item-parent').selectOption('eat');
  await expect(joyce.page.getByTestId('item-slot-1')).toBeDisabled(); // smoothie
  await joyce.page.getByTestId('item-slot-0').click();
  await joyce.page.getByTestId('item-move').click();
  expect(asked).toContain('learned where this is');
  await expect(page.getByTestId('orbit-empty-6')).toBeVisible(); // its old spot stays empty; nothing shifts
  await page.getByTestId('orbit-eat').click();
  await expect(page.getByTestId('orbit-music')).toHaveAttribute('data-slot', '0');
  await joyce.context.close();
});

test('the catalog API checks roles, slots and input', async ({ request }) => {
  const joyce = await apiAs(request, 'joyce');
  const pilar = await apiAs(request, 'pilar');
  expect((await pilar.patch('/api/items/bath', { short_label: 'x' })).status()).toBe(403);
  expect((await joyce.patch('/api/items/bath', { orbit: 'inner', orbit_slot: 0 })).status()).toBe(409);
  expect((await joyce.patch('/api/items/lucho', { orbit: 'outer', orbit_slot: 5 })).status()).toBe(400);
  expect((await joyce.patch('/api/items/bath', { orbit: 'inner', orbit_slot: 9 })).status()).toBe(400);
  expect((await joyce.patch('/api/items/water', { orbit: 'inner', orbit_slot: 7, parent_id: 'bath' })).status()).toBe(400);
  expect((await joyce.patch('/api/items/bath', { label_en: '  ' })).status()).toBe(400);
  expect((await joyce.patch('/api/items/nope', { short_label: 'x' })).status()).toBe(404);
  expect((await joyce.post('/api/items/bath/rules', { kind: 'window' })).status()).toBe(400);
  expect((await joyce.raw('PUT', '/api/items/bath/audio?lang=fr', FAKE_WEBM, 'audio/webm')).status()).toBe(400);
  const items = await (await pilar.get('/api/items')).json();
  expect(items.find((i: { id: string }) => i.id === 'eat').tap).toBe('open');
});
