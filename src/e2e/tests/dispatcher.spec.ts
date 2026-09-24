import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('"You had grapes at 3:08" — a gentle reminder from the log, message still sent', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  await joyce.post('/api/logs', { type: 'food', symbol_id: 'grapes', amount: 0.5, at: '2026-09-23T15:08:00-04:00' });
  await login(page, 'jonatito');
  await build(page, ['grapes', 'eat_f']);
  await page.getByTestId('send').click();
  const recent = page.getByTestId('note-recent');
  await expect(recent).toHaveAttribute('data-symbol', 'grapes');
  await expect(recent.getByTestId('recent-time')).toHaveText('3:08');
  await expect(page.getByTestId('note-delivered')).toBeVisible();
});

test('no reminder when the grapes were more than an hour ago', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  await joyce.post('/api/logs', { type: 'food', symbol_id: 'grapes', at: '2026-09-23T13:00:00-04:00' });
  await login(page, 'jonatito');
  await build(page, ['grapes', 'eat_f']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-delivered')).toBeVisible();
  await expect(page.getByTestId('note-recent')).toHaveCount(0);
});

test('smoothie 2 of 2 today suggests water — the same word on the Drinks page counts too', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  await joyce.post('/api/logs', { type: 'drink', symbol_id: 'smoothie', at: '2026-09-23T09:00:00-04:00' });
  await joyce.post('/api/logs', { type: 'drink', symbol_id: 'smoothie_d', at: '2026-09-23T12:00:00-04:00' });
  await login(page, 'jonatito');
  await build(page, [{ page: 'drink' }, 'smoothie_d', 'drink_d']);
  await page.getByTestId('send').click();
  const limit = page.getByTestId('note-limit');
  await expect(limit).toHaveAttribute('data-symbol', 'smoothie');
  await expect(limit.getByTestId('limit-suggest')).toHaveAttribute('data-symbol', 'water');
  await expect(limit.locator('.dots i.full')).toHaveCount(2);
});

test('the next meal shows as a clock (dinner at 6:30)', async ({ page }) => {
  await login(page, 'jonatito');
  await build(page, ['water', 'drink_f']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-upcoming').locator('svg.clock12')).toHaveAttribute('aria-label', '6:30');
});

test('after quiet hours start, messages to friends go to the caretaker on duty', async ({ request }) => {
  await setClock(request, '2026-09-23T21:30:00-04:00');
  const child = await apiAs(request, 'jonatito');
  const r = await child.post('/api/messages', { tokens: [{ kind: 'person', id: 'tintin' }, { kind: 'thing', id: 'train' }] });
  const body = await r.json();
  expect(body.notes).toContainEqual({ kind: 'delivered', person_id: 'mommy_joyce' });
  const tintin = await apiAs(request, 'tintin');
  expect(await (await tintin.get('/api/messages')).json()).toHaveLength(0);
});

test('a busy status with an "until" time expires on its own', async ({ request }) => {
  const lucho = await apiAs(request, 'lucho');
  await lucho.put('/api/availability', { status: 'busy', until_minutes: 30 });
  await setClock(request, '2026-09-23T16:20:00-04:00');
  const child = await apiAs(request, 'jonatito');
  const body = await (await child.post('/api/messages', { tokens: [{ kind: 'person', id: 'lucho' }, { kind: 'social', id: 'yes' }] })).json();
  expect(body.notes[0]).toEqual({ kind: 'delivered', person_id: 'lucho' });
});
