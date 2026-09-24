import { expect, test } from '@playwright/test';
import { login, resetDb } from './helpers.ts';

test.beforeEach(async ({ request }) => resetDb(request));

test('Jonatito signs in on the tablet and lands on his board', async ({ page }) => {
  await login(page, 'jonatito');
  await expect(page.getByTestId('here-now')).toBeVisible();
  await expect(page.getByTestId('me-button')).toBeVisible();
  await expect(page.getByTestId('grid')).toBeVisible();
});

test('a caretaker gets inbox, status, log, people and words tabs', async ({ page }) => {
  await login(page, 'joyce');
  await expect(page.getByTestId('family-app')).toHaveAttribute('data-role', 'caretaker');
  for (const tab of ['inbox', 'status', 'log', 'people', 'words']) await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
});

test('a friend only gets inbox and status', async ({ page }) => {
  await login(page, 'pilar');
  await expect(page.getByTestId('family-app')).toHaveAttribute('data-role', 'friend');
  await expect(page.getByTestId('tab-inbox')).toBeVisible();
  await expect(page.getByTestId('tab-status')).toBeVisible();
  await expect(page.getByTestId('tab-log')).toHaveCount(0);
  await expect(page.getByTestId('tab-people')).toHaveCount(0);
});

test('wrong PIN is rejected, and 5 wrong PINs lock the name for a minute', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('login-username').fill('joyce');
    await page.getByTestId('login-pin').fill('9999');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Wrong name or PIN');
  }
  await page.getByTestId('login-username').fill('joyce');
  await page.getByTestId('login-pin').fill('1234');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('Too many attempts');
});

test('the session survives a reload, and sign out ends it', async ({ page }) => {
  await login(page, 'tintin');
  await page.reload();
  await expect(page.getByTestId('family-app')).toBeVisible();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-username')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('login-username')).toBeVisible();
});
