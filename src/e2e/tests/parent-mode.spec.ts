import { expect, test, type Page } from '@playwright/test';
import { AFTERNOON, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
  await login(page, 'jonatito');
});

async function holdCorner(page: Page, ms: number) {
  const box = (await page.getByTestId('parent-corner').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByTestId(`key-${d}`).click();
  await page.getByTestId('key-✔').click();
}

test('a short tap on the corner does nothing (he can\'t open it by accident)', async ({ page }) => {
  await holdCorner(page, 500);
  await expect(page.getByTestId('parent-gate')).toHaveCount(0);
});

test('3-second hold + caretaker PIN opens parent mode; Exit returns to his board', async ({ page }) => {
  await holdCorner(page, 3200);
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  await typePin(page, '0000');
  await expect(page.getByTestId('gate-error')).toContainText('Wrong PIN');

  await typePin(page, '1234');
  await expect(page.getByTestId('parent-mode')).toBeVisible();
  await expect(page.getByTestId('family-name')).toContainText('Mommy Joyce');

  // Log from the tablet
  await page.getByTestId('log-grapes').click();
  await page.getByTestId('log-save').click();
  await expect(page.getByTestId('log-entry')).toHaveCount(1);

  // Tablet-only voice setting
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('lang-es').click();

  await page.getByTestId('exit-parent').click();
  await expect(page.getByTestId('child-app')).toBeVisible();
  await page.getByTestId('open-day').click();
  await expect(page.getByTestId('day-entry')).toHaveCount(1);
});

test('a friend\'s PIN does not open parent mode', async ({ page }) => {
  await holdCorner(page, 3200);
  await typePin(page, '3333');
  await expect(page.getByTestId('gate-error')).toBeVisible();
  await page.getByTestId('gate-cancel').click();
  await expect(page.getByTestId('parent-gate')).toHaveCount(0);
});
