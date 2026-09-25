// My body: where it hurts and how much.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('his face opens My body; tummy + a crying face is urgent and reaches everyone on duty', async ({ page, browser }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('body-view')).toBeVisible();
  await expect(page.getByTestId('pain-4')).toBeDisabled(); // pick a place first

  await page.getByTestId('body-tummy').click();
  await expect(page.getByTestId('body-which')).toContainText('tummy');
  await page.getByTestId('pain-4').click();
  const card = page.getByTestId('pain-card');
  await expect(card).toHaveAttribute('data-kind', 'urgent');
  await expect(card).toContainText('My tummy hurts very much.');

  const msg = joyce.page.getByTestId('inbox-message').first();
  await expect(msg).toHaveAttribute('data-priority', 'urgent');
  await expect(msg.getByTestId('message-pain')).toHaveAttribute('data-part', 'tummy');
  await expect(msg.getByTestId('message-pain')).toHaveAttribute('data-level', '4');
  await joyce.context.close();
});

test('a little pain goes to the caretaker on duty; no pain is only logged', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-me').click();
  await page.getByTestId('body-ear-left').click();
  await page.getByTestId('pain-1').click();
  await expect(page.getByTestId('pain-card')).toHaveAttribute('data-kind', 'sent');
  await expect(page.getByTestId('pain-sent')).toContainText('Mommy Joyce');
  await page.getByTestId('pain-ok').click();

  await page.getByTestId('body-head').click();
  await page.getByTestId('pain-0').click();
  await expect(page.getByTestId('pain-card')).toHaveAttribute('data-kind', 'logged');

  const joyce = await apiAs(request, 'joyce');
  const inbox = await (await joyce.get('/api/messages')).json();
  expect(inbox).toHaveLength(1);
  expect(inbox[0].priority).toBe('normal');
  expect(inbox[0].pain).toEqual({ part: 'ear', side: 'left', level: 1 });
  expect(inbox[0].sentence_es).toBe('Me duele un poco el oído.');
  const logs = await (await joyce.get('/api/logs')).json();
  expect(logs.filter((l: { type: string }) => l.type === 'pain')).toHaveLength(2);
});

test('a caretaker can hide the potty zone; the server refuses reports for hidden parts', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  expect((await joyce.patch('/api/items/body_potty', { is_hidden: true })).ok()).toBeTruthy();
  await login(page, 'jonatito');
  await page.getByTestId('orbit-me').click();
  await expect(page.getByTestId('body-tummy')).toBeVisible();
  await expect(page.getByTestId('body-potty')).toHaveCount(0);
  const child = await apiAs(request, 'jonatito');
  expect((await child.post('/api/pain', { part: 'potty', level: 3 })).status()).toBe(400);
  expect((await child.post('/api/pain', { part: 'elbow', level: 3 })).status()).toBe(400);
  expect((await child.post('/api/pain', { part: 'tummy', level: 9 })).status()).toBe(400);
  expect((await joyce.post('/api/pain', { part: 'tummy', level: 2 })).status()).toBe(403);
});
