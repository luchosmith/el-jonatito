import { expect, test } from '@playwright/test';
import { apiAs, resetDb, TINY_JPEG } from './helpers.ts';

test.beforeEach(async ({ request }) => resetDb(request));

test('nothing is readable without signing in', async ({ request }) => {
  for (const url of ['/api/board', '/api/messages', '/api/logs', '/api/media', '/api/events', '/api/images/seed-person-lucho.jpg']) {
    expect((await request.get(url)).status(), url).toBe(401);
  }
});

test('friends cannot log food, change pictures or words', async ({ request }) => {
  const pilar = await apiAs(request, 'pilar');
  expect((await pilar.post('/api/logs', { type: 'food', symbol_id: 'grapes' })).status()).toBe(403);
  expect((await pilar.raw('PUT', '/api/people/lexi/photo', TINY_JPEG, 'image/jpeg')).status()).toBe(403);
  expect((await pilar.patch('/api/symbols/grapes', { is_hidden: true })).status()).toBe(403);
  expect((await pilar.patch('/api/people/lexi', { short_label: 'x' })).status()).toBe(403);
});

test('the child cannot reply, log, or read anyone\'s inbox', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  const sent = await (await child.post('/api/messages', { tokens: [{ kind: 'person', id: 'pilar' }, { kind: 'social', id: 'yes' }] })).json();
  expect((await child.post(`/api/messages/${sent.message.id}/replies`, { kind: 'yes' })).status()).toBe(403);
  expect((await child.post('/api/logs', { type: 'food' })).status()).toBe(403);
  const mine = await (await child.get('/api/messages')).json();
  expect(mine.every((m: { from_user_id: number }) => m.from_user_id === sent.message.from_user_id)).toBe(true);
});

test('only recipients can reply to a message', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  const sent = await (await child.post('/api/messages', { tokens: [{ kind: 'person', id: 'pilar' }, { kind: 'social', id: 'yes' }] })).json();
  const tintin = await apiAs(request, 'tintin');
  expect((await tintin.post(`/api/messages/${sent.message.id}/replies`, { kind: 'yes' })).status()).toBe(403);
  const pilar = await apiAs(request, 'pilar');
  expect((await pilar.post(`/api/messages/${sent.message.id}/replies`, { kind: 'yes' })).status()).toBe(200);
});

test('only the child tablet can open parent mode, and only with a caretaker PIN', async ({ request }) => {
  const joyce = await apiAs(request, 'joyce');
  expect((await joyce.post('/api/auth/elevate', { pin: '1234' })).status()).toBe(403);
  const child = await apiAs(request, 'jonatito');
  expect((await child.post('/api/auth/elevate', { pin: '3333' })).status()).toBe(401);
  const ok = await child.post('/api/auth/elevate', { pin: '2222' });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).user.person_id).toBe('larry');
});

test('uploads must really be images; file paths cannot escape the upload folder', async ({ request }) => {
  const joyce = await apiAs(request, 'joyce');
  expect((await joyce.raw('PUT', '/api/people/lexi/photo', Buffer.from('not an image'), 'image/jpeg')).status()).toBe(415);
  expect((await joyce.raw('PUT', '/api/people/lexi/photo', TINY_JPEG, 'application/pdf')).status()).toBe(415);
  expect([400, 404]).toContain((await joyce.get('/api/images/..%2F..%2Fjonatito.sqlite')).status());
});

test('bad input is rejected with a clear 400', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  expect((await child.post('/api/messages', { tokens: [] })).status()).toBe(400);
  expect((await child.post('/api/messages', { tokens: [{ kind: 'thing', id: 'unicorn' }] })).status()).toBe(400);
  expect((await child.post('/api/messages', { tokens: [{ kind: 'bogus', id: 'grapes' }] })).status()).toBe(400);
  const joyce = await apiAs(request, 'joyce');
  expect((await joyce.post('/api/logs', { type: 'food', amount: 7 })).status()).toBe(400);
  expect((await joyce.put('/api/availability', { status: 'sleeping' })).status()).toBe(400);
});
