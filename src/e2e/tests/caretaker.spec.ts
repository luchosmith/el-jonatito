import { expect, test } from '@playwright/test';
import { AFTERNOON, device, login, resetDb, setClock, TINY_JPEG, openBoard, build } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('quick log: ½ chicken soup shows up on his "My day" plate and list', async ({ page, browser }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-log').click();
  await joyce.page.getByTestId('log-chicken_soup').click();
  await joyce.page.getByTestId('amount-0.5').click();
  await joyce.page.getByTestId('log-save').click();
  await expect(joyce.page.getByTestId('log-entry')).toHaveCount(1);
  await expect(joyce.page.getByTestId('log-entry').first()).toContainText('3:40 pm');

  await login(page, 'jonatito');
  await page.getByTestId('open-day').click();
  const entry = page.getByTestId('day-entry').first();
  await expect(entry).toHaveAttribute('data-symbol', 'chicken_soup');
  await expect(entry).toContainText('3:40 · Mommy Joyce');
  await expect(page.getByTestId('meal-snack')).toHaveAttribute('data-amount', '0.5');
  await joyce.context.close();
});

test('drinks fill his glass', async ({ page, browser }) => {
  const larry = await device(browser, 'larry', { clock: AFTERNOON });
  await larry.page.getByTestId('tab-log').click();
  for (let i = 0; i < 3; i++) {
    await larry.page.getByTestId('log-water').click();
    await larry.page.getByTestId('log-save').click();
  }
  await expect(larry.page.getByTestId('log-entry')).toHaveCount(3);
  await login(page, 'jonatito');
  await page.getByTestId('open-day').click();
  await expect(page.getByTestId('glass')).toHaveAttribute('data-count', '3');
  await larry.context.close();
});

test('hiding a word leaves an empty slot — nothing else moves', async ({ page, browser }) => {
  await login(page, 'jonatito');
  await openBoard(page);
  await expect(page.getByTestId('sym-pancakes')).toHaveAttribute('data-slot', '5');
  await expect(page.getByTestId('sym-grapes')).toHaveAttribute('data-slot', '4');

  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-words').click();
  await joyce.page.getByTestId('word-pancakes').click();
  await expect(joyce.page.getByTestId('word-pancakes')).toHaveAttribute('data-hidden', 'true');

  await expect(page.getByTestId('sym-pancakes')).toHaveCount(0);
  await expect(page.getByTestId('slot-5')).toHaveClass(/hidden-slot/);
  await expect(page.getByTestId('sym-grapes')).toHaveAttribute('data-slot', '4');
  await expect(page.getByTestId('sym-pasta_red')).toHaveAttribute('data-slot', '6');

  await joyce.page.getByTestId('word-pancakes').click();
  await expect(page.getByTestId('sym-pancakes')).toHaveAttribute('data-slot', '5');
  await joyce.context.close();
});

test('an admin replaces Loki\'s picture with a real photo, then reverts it', async ({ page, browser }) => {
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }]); // pets are on the board's People page (not in the dock)
  await expect(page.getByTestId('sym-loki').locator('img')).toHaveCount(0);
  await expect(page.getByTestId('sym-lexi').locator('img')).toHaveAttribute('src', /seed-item-lexi/); // Lexi has the family photo

  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-people').click();
  await joyce.page.getByTestId('photo-loki').setInputFiles({ name: 'loki.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG });
  await expect(joyce.page.getByTestId('admin-loki').locator('img')).toBeVisible();

  // The tablet updates live, same spot
  await expect(page.getByTestId('sym-loki').locator('img')).toHaveAttribute('src', /\/api\/images\//);

  await joyce.page.getByTestId('revert-loki').click();
  await expect(page.getByTestId('sym-loki').locator('img')).toHaveCount(0);
  await joyce.context.close();
});

test('an admin can rename a label and hide a person', async ({ page, browser }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-people').click();
  await joyce.page.getByTestId('label-tintin').fill('Tin Tin');
  await joyce.page.getByTestId('label-tintin').blur();
  await joyce.page.getByTestId('visible-loki').click();

  await login(page, 'jonatito');
  await expect(page.getByTestId('dock-tintin')).toContainText('Tin Tin');
  await build(page, [{ page: 'people' }]);
  await expect(page.getByTestId('sym-loki')).toHaveCount(0);
  await expect(page.getByTestId('sym-lexi')).toBeVisible();
  await joyce.context.close();
});
