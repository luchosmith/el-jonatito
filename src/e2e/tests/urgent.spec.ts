import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, login, resetDb, setClock, build } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('HELP goes to every caretaker on duty at once, flagged urgent', async ({ page, browser, request }) => {
  const lucho = await apiAs(request, 'lucho');
  await lucho.put('/api/availability', { status: 'away', until_minutes: 120 });
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await login(page, 'jonatito');

  await build(page, ['help']);
  await page.getByTestId('send').click();
  const note = page.getByTestId('note-urgent');
  await expect(note.getByTestId('urgent-to-mommy_joyce')).toBeVisible();
  await expect(note.getByTestId('urgent-to-larry')).toBeVisible();
  await expect(note.getByTestId('urgent-to-lucho')).toHaveCount(0);

  const msg = joyce.page.getByTestId('inbox-message').first();
  await expect(msg).toHaveAttribute('data-priority', 'urgent');
  await expect(msg.getByTestId('urgent-tag')).toBeVisible();
  await joyce.context.close();
});

test('"I hurt" to a friend also reaches the caretakers on duty', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  const body = await (await child.post('/api/messages', { tokens: [{ kind: 'person', id: 'tintin' }, { kind: 'urgent', id: 'hurt' }] })).json();
  expect(body.message.priority).toBe('urgent');
  expect(body.notes[0].recipient_person_ids.sort()).toEqual(['larry', 'lucho', 'mommy_joyce', 'tintin']);
});

test('if nobody is on duty, urgent messages go to every caretaker', async ({ request }) => {
  for (const u of ['joyce', 'lucho', 'larry']) await (await apiAs(request, u)).put('/api/availability', { status: 'away', until_minutes: 60 });
  const child = await apiAs(request, 'jonatito');
  const body = await (await child.post('/api/messages', { tokens: [{ kind: 'urgent', id: 'stop' }] })).json();
  expect(body.notes[0].recipient_person_ids.sort()).toEqual(['larry', 'lucho', 'mommy_joyce']);
});
