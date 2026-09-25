// The person screen: where they are compared with him, their voice notes, and sending to them.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('Abuela Pilar records "For Jonatito"; a sound wave appears in front of her face; he plays it', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await pilar.page.getByTestId('tab-jonatito').click();
  await pilar.page.getByTestId('voice-record').click();
  await expect(pilar.page.getByTestId('voice-record')).toHaveAttribute('data-state', 'recording');
  await pilar.page.waitForTimeout(1200);
  await pilar.page.getByTestId('voice-record').click();
  await expect(pilar.page.getByTestId('voice-preview')).toBeVisible();
  await pilar.page.getByTestId('voice-send').click();
  await expect(pilar.page.getByTestId('voice-mine-item')).toHaveAttribute('data-heard', 'no');

  // Live on the tablet, in the orbit and in the dock.
  const badge = page.getByTestId('voice-badge-pilar');
  await expect(badge).toBeVisible();
  await expect(page.getByTestId('dock-voice-pilar')).toBeVisible();
  const played = page.waitForResponse((r) => r.url().includes('/api/audio/') && r.status() < 300);
  await badge.click();
  await played;
  await expect(badge).toHaveCount(0);
  await expect(page.getByTestId('strip-token')).toHaveCount(0); // hearing is not a word in the sentence

  await expect(pilar.page.getByTestId('voice-mine-item')).toHaveAttribute('data-heard', 'yes');
  await pilar.context.close();
});

test('pinned comfort clips come first on the shelf; hidden notes are gone', async ({ page, request }) => {
  const joyce = await apiAs(request, 'joyce');
  const first = await (await joyce.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  const second = await (await joyce.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  const third = await (await joyce.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  await joyce.patch(`/api/voice-notes/${first.id}`, { pinned: true });
  await joyce.patch(`/api/voice-notes/${third.id}`, { hidden: true });

  await login(page, 'jonatito');
  await page.getByTestId('dock-mommy_joyce').click();
  const tiles = page.getByTestId('voice-tile');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toHaveAttribute('data-id', String(first.id));
  await expect(tiles.nth(0)).toHaveAttribute('data-pinned', 'yes');
  await expect(tiles.nth(1)).toHaveAttribute('data-id', String(second.id));
});

test('a caretaker pins and hides notes from the Voices tab', async ({ page, browser, request }) => {
  const pilar = await apiAs(request, 'pilar');
  const note = await (await pilar.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  await login(page, 'jonatito');
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-voices').click();
  await joyce.page.getByTestId(`voice-pin-${note.id}`).click();
  await expect(joyce.page.getByTestId(`voice-pin-${note.id}`)).toContainText('Pinned');

  await page.getByTestId('dock-pilar').click();
  await expect(page.getByTestId('voice-tile').first()).toHaveAttribute('data-pinned', 'yes');
  await joyce.page.getByTestId(`voice-hide-${note.id}`).click();
  await expect(page.getByTestId('voice-tile')).toHaveCount(0);
  await joyce.context.close();
});

test('friends only see their own notes and cannot pin', async ({ request }) => {
  const pilar = await apiAs(request, 'pilar');
  const tintin = await apiAs(request, 'tintin');
  const note = await (await pilar.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  expect(await (await tintin.get('/api/voice-notes')).json()).toEqual([]);
  expect((await tintin.patch(`/api/voice-notes/${note.id}`, { pinned: true })).status()).toBe(403);
  expect((await (await apiAs(request, 'jonatito')).raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).status()).toBe(403);
  expect((await pilar.raw('POST', '/api/voice-notes', FAKE_WEBM, 'text/plain')).status()).toBe(415);
});

test('Where I am: Lima with a return date shows her pin, a plane, her time and moons until she is back', async ({ page, browser }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await pilar.page.getByTestId('tab-status').click();
  await pilar.page.getByTestId('where-search').fill('lim');
  await pilar.page.getByTestId('where-pick-Lima').click();
  await pilar.page.getByTestId('where-until').fill('2026-09-26');
  await pilar.page.getByTestId('where-save').click();
  await expect(pilar.page.getByTestId('where-current')).toContainText('Lima');

  await login(page, 'jonatito');
  await page.getByTestId('dock-pilar').click();
  const where = page.getByTestId('person-where');
  await expect(where).toHaveAttribute('data-reach', 'abroad');
  await expect(where.getByTestId('where-place')).toHaveText('Lima');
  await expect(where.getByTestId('where-how')).toHaveText('✈️');
  await expect(where.getByTestId('their-time')).toHaveAttribute('data-time', '2:40'); // 3:40 at home
  await expect(where.getByTestId('back-sleeps')).toHaveAttribute('data-n', '3');

  // Stop sharing: he sees a question mark.
  await pilar.page.getByTestId('where-off').click();
  await expect(where).toHaveAttribute('data-reach', 'unknown');
  await expect(where.getByTestId('globe-unknown')).toBeVisible();
  await pilar.context.close();
});

test('same city: a close-up of the ground and a car; same time, no time shown', async ({ page, request }) => {
  await (await apiAs(request, 'joyce')).put('/api/location', { place_label: 'Newark', country_code: 'US', tz: 'America/New_York', lat: 40.74, lon: -74.17 });
  await login(page, 'jonatito');
  await page.getByTestId('dock-mommy_joyce').click();
  await expect(page.getByTestId('person-where')).toHaveAttribute('data-reach', 'same_city');
  await expect(page.getByTestId('where-how')).toHaveText('🚗');
  await expect(page.getByTestId('their-time')).toHaveCount(0);
});

test('locations are city-level and private: friends only see their own; bad input is refused', async ({ request }) => {
  const pilar = await apiAs(request, 'pilar');
  const tintin = await apiAs(request, 'tintin');
  const r = await (await pilar.put('/api/location', { place_label: 'Lima', country_code: 'PE', tz: 'America/Lima', lat: -12.0464, lon: -77.0428 })).json();
  expect([r.lat, r.lon]).toEqual([-12, -77]);
  expect((await (await tintin.get('/api/locations')).json()).people).toEqual([]);
  expect((await (await apiAs(request, 'jonatito')).get('/api/locations').then((x) => x.json())).people).toHaveLength(1);
  expect((await pilar.put('/api/location', { place_label: 'X', country_code: 'PE', tz: 'Mars/Olympus', lat: 0, lon: 0 })).status()).toBe(400);
  expect((await pilar.put('/api/location', { place_label: 'X', country_code: 'PE', tz: 'America/Lima', lat: 99, lon: 0 })).status()).toBe(400);
});

test('LOVE from the person screen reaches her; a busy person gets the usual card', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-pilar').click();
  await page.getByTestId('zone-love').click();
  await expect(page.getByTestId('sent-ok')).toHaveText('📬✔');
  const inbox = await (await (await apiAs(request, 'pilar')).get('/api/messages')).json();
  expect(inbox[0].sentence_en).toBe('Abuela Pilar, I love you!');

  await (await apiAs(request, 'lucho')).put('/api/availability', { status: 'busy', until_minutes: 30 });
  await page.getByTestId('dock-lucho').click();
  await page.getByTestId('zone-come-see').click();
  await expect(page.getByTestId('note-busy')).toBeVisible();
});

test('pets have a person screen with no sending', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-lexi').click();
  await expect(page.getByTestId('person-lexi')).toBeVisible();
  await expect(page.getByTestId('zone-talk')).toHaveCount(0);
  await expect(page.getByTestId('voice-shelf')).toHaveCount(0);
});
