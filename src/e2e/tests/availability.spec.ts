import { expect, test } from '@playwright/test';
import { AFTERNOON, device, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('a family member sets Busy on their phone and the ring on the tablet changes live', async ({ page, browser }) => {
  await login(page, 'jonatito');
  await expect(page.getByTestId('dock-pilar')).toHaveAttribute('data-status', 'available');

  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await pilar.page.getByTestId('tab-status').click();
  await pilar.page.getByTestId('status-minutes').selectOption('30');
  await pilar.page.getByTestId('status-busy').click();
  await expect(pilar.page.getByTestId('status-current')).toContainText('busy');

  await expect(page.getByTestId('dock-pilar')).toHaveAttribute('data-status', 'busy');
  await expect(page.getByTestId('dock-pilar')).toHaveClass(/busy/);

  // Her close-up shows when she'll be free, on a 12-hour clock
  await page.getByTestId('dock-pilar').click();
  await expect(page.getByTestId('person-status').locator('svg.clock12')).toHaveAttribute('aria-label', '4:10');

  await pilar.page.getByTestId('status-available').click();
  await page.getByTestId('me-button').click();
  await expect(page.getByTestId('dock-pilar')).toHaveAttribute('data-status', 'available');
  await pilar.context.close();
});

test('Away shows a grey ring', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const larry = await device(browser, 'larry', { clock: AFTERNOON });
  await larry.page.getByTestId('tab-status').click();
  await larry.page.getByTestId('status-away').click();
  await expect(page.getByTestId('dock-larry')).toHaveClass(/away/);
  await larry.context.close();
});
