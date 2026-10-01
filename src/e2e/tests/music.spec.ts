// 🎧 Music: his songs in a random order, as square pictures in play order; it keeps playing on every
// screen and stops when he taps 🎧 again, when a film starts, or at bedtime.
import { expect, test, type Page } from '@playwright/test';
import { AFTERNOON, apiAs, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
  expect(await (await request.post('/api/test/songs')).json()).toEqual({ added: 3, skipped: 0 });
});

const nowPlaying = (page: Page) => page.getByTestId('music-now').getAttribute('data-song');
const order = async (page: Page) => page.getByTestId('music-song').evaluateAll((els) => els.map((e) => e.getAttribute('data-song')));

test('🎧 plays his songs in a random order; the page shows them in play order; a tap plays from there; it goes on by itself', async ({ page, request }) => {
  await login(page, 'jonatito');
  const firstFile = page.waitForRequest(/\/api\/songs\/\d+\/file/);
  await page.getByTestId('orbit-music').click();
  await firstFile; // the music really starts
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'yes');
  await expect(page.getByTestId('music-song')).toHaveCount(3);
  // Square tiles that never overlap (the page scrolls when there are many).
  const tiles = await page.getByTestId('music-song').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => [b.x, b.y, b.width, b.height]));
  for (const [, , w, h] of tiles) expect([Math.round(w), Math.round(h)]).toEqual([104, 104]);
  const list = await order(page);
  expect(await nowPlaying(page)).toBe(list[0]);
  await expect(page.getByTestId('music-song').first()).toHaveClass(/cur/);
  // A song with cover art shows it; one without gets a coloured tile with its name.
  await expect(page.locator('[data-testid="music-song"] img')).toHaveCount(1);
  await expect(page.getByTestId('music-song').filter({ hasText: 'Short Song' })).toBeVisible();

  // He taps the second one: it plays (yellow frame); the first is not faded and can be tapped again.
  await page.getByTestId('music-song').nth(1).click();
  await expect.poll(() => nowPlaying(page)).toBe(list[1]);
  await expect(page.getByTestId('music-song').nth(1)).toHaveClass(/cur/);
  await expect(page.getByTestId('music-song').first()).toHaveCSS('opacity', '1');
  // Each test song is 2 s long: the list goes on to the third by itself.
  await expect.poll(() => nowPlaying(page), { timeout: 8000 }).toBe(list[2]);
  // A song already played: tap it, it plays again and the list goes on from there.
  await page.getByTestId('music-song').first().click();
  await expect.poll(() => nowPlaying(page)).toBe(list[0]);
  await expect(page.getByTestId('music-song').first()).toHaveClass(/cur/);
  // Every music tap is in his log (what he picked, by name).
  const joyce = await apiAs(request, 'joyce');
  await expect.poll(async () => {
    const moments = await (await joyce.get('/api/moments')).json();
    return moments.flatMap((e: { moment?: { chips: { action: string; label: string }[] } }) => e.moment?.chips ?? []).filter((c: { action: string }) => c.action === 'music').map((c: { label: string }) => c.label);
  }, { timeout: 8000 }).toEqual(expect.arrayContaining(['🎧 on', expect.stringMatching(/^🎧 (Tiny Tune|Short Song|Third One)$/)]));
});

test('it keeps playing at home (🎧 glows, with the song’s picture); the picture opens the songs; 🎧 again stops it', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-music').click();
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'yes');
  await page.getByTestId('music-home').click();
  await expect(page.getByTestId('orbit-music')).toHaveClass(/music-on/);
  await page.getByTestId('music-now-badge').click();
  await expect(page.getByTestId('music-view')).toBeVisible();
  await page.getByTestId('music-home').click();
  await page.getByTestId('orbit-music').click({ position: { x: 20, y: 20 } }); // 🎧 itself (not the song's picture)
  await expect(page.getByTestId('orbit-music')).not.toHaveClass(/music-on/);
  // A caretaker can hide a song (only caretakers).
  const songs = (await (await (await apiAs(request, 'joyce')).get('/api/songs')).json()).songs;
  expect((await (await apiAs(request, 'joyce')).patch(`/api/songs/${songs[0].id}`, { hidden: true })).ok()).toBeTruthy();
  expect((await (await apiAs(request, 'jonatito')).get('/api/songs')).ok()).toBeTruthy();
  expect((await (await (await apiAs(request, 'jonatito')).get('/api/songs')).json()).songs).toHaveLength(2);
  expect((await (await apiAs(request, 'pilar')).patch(`/api/songs/${songs[0].id}`, { hidden: false })).status()).toBe(403);
  await expect(page.getByTestId('music-view')).toHaveCount(0);
  // His history strip has a 🎧.
  await expect(page.locator('[data-testid="tl-hist"][data-kind="media"]')).toHaveCount(1);
});

test('tapping the big picture pauses the same song, and tapping again goes on (no new song, no restart)', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-music').click();
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'yes');
  const song = await nowPlaying(page);
  const files: string[] = [];
  page.on('request', (r) => { if (/\/api\/songs\/\d+\/file/.test(r.url())) files.push(r.url()); });
  await page.getByTestId('music-now').click();
  await expect(page.getByTestId('music-now')).toHaveAttribute('data-paused', 'yes');
  await page.waitForTimeout(3000); // longer than a whole test song: had it kept playing, the next one would be on
  expect(await nowPlaying(page)).toBe(song);
  await page.getByTestId('music-now').click();
  await expect(page.getByTestId('music-now')).toHaveAttribute('data-paused', 'no');
  expect(await nowPlaying(page)).toBe(song);
  expect(files.filter((u) => u.endsWith(`/api/songs/${song}/file`)).length).toBeLessThanOrEqual(1); // not loaded again from the start
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'yes'); // still on
  // It is in his log.
  const joyce = await apiAs(request, 'joyce');
  await expect.poll(async () => JSON.stringify(await (await joyce.get('/api/moments')).json()), { timeout: 8000 }).toContain('🎧 ⏸');
});

test('a film stops the music', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-music').click();
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'yes');
  await page.getByTestId('dock-pongo').click();
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('player-exit').click();
  await expect(page.getByTestId('orbit-music')).not.toHaveClass(/music-on/);
});

test('after bedtime the music is sleeping: a moon and when it wakes up', async ({ page, request }) => {
  await setClock(request, '2026-09-23T21:30:00-04:00', [page]);
  await login(page, 'jonatito');
  await page.getByTestId('orbit-music').click();
  await expect(page.getByTestId('music-sleeping')).toContainText('7:00');
  await expect(page.getByTestId('music-view')).toHaveAttribute('data-playing', 'no');
});
