// A caretaker records a message on their phone; it pops up on his tablet and plays once, then stays
// on their page for replay.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('Mommy Joyce taps 🎙️, records, sends: her face pops up on his tablet and the message plays once', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  const fab = joyce.page.getByTestId('rec-fab');
  await fab.click();
  await expect(fab).toHaveAttribute('data-state', 'recording');
  await joyce.page.waitForTimeout(1500);
  await fab.click();
  await expect(joyce.page.getByTestId('rec-preview')).toBeVisible();

  const played = page.waitForResponse((r) => r.url().includes('/api/audio/') && r.status() < 300);
  await joyce.page.getByTestId('rec-send').click();
  await expect(fab).toHaveAttribute('data-state', 'sent');

  const pop = page.getByTestId('voice-arrival');
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId('voice-arrival-face').locator('img')).toHaveAttribute('alt', 'Mommy Joyce');
  await played; // it started playing without a tap
  await expect(pop).toHaveAttribute('data-state', 'done', { timeout: 10_000 }); // played to the end
  await expect(pop).toHaveCount(0, { timeout: 12_000 }); // then it goes away by itself
  await expect(page.getByTestId('orbit')).toBeVisible();
  await expect(page.getByTestId('voice-badge-mommy_joyce')).toHaveCount(0); // already heard

  // Still there to replay on her page.
  await page.getByTestId('dock-mommy_joyce').click();
  const tile = page.getByTestId('voice-tile').first();
  await expect(tile).toHaveAttribute('data-heard', 'yes');
  // And she can see he heard it.
  await joyce.page.getByTestId('tab-jonatito').click();
  await expect(joyce.page.getByTestId('voice-mine-item').first()).toHaveAttribute('data-heard', 'yes');
  await joyce.context.close();
});

test('tapping the face in the pop-up opens her page', async ({ page, request }) => {
  await login(page, 'jonatito');
  const joyce = await apiAs(request, 'joyce');
  await joyce.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm');
  await page.getByTestId('voice-arrival-face').click();
  await expect(page.getByTestId('person-mommy_joyce')).toBeVisible();
  await expect(page.getByTestId('voice-arrival')).toHaveCount(0);
});

test('while Pongo plays full screen, the message waits until he comes back', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-pongo').click();
  await expect(page.getByTestId('player')).toBeVisible();
  await (await apiAs(request, 'pilar')).raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm');
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('voice-arrival')).toHaveCount(0);
  await page.getByTestId('player-exit').click();
  await expect(page.getByTestId('voice-arrival')).toBeVisible();
});

test('two messages in a row pop up one after the other', async ({ page, request }) => {
  await login(page, 'jonatito');
  await (await apiAs(request, 'pilar')).raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm');
  await (await apiAs(request, 'lucho')).raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm');
  const pop = page.getByTestId('voice-arrival');
  await expect(pop.getByTestId('voice-arrival-face').locator('img')).toHaveAttribute('alt', 'Abuela Pilar');
  await pop.getByTestId('voice-arrival-face').click(); // he goes to her page
  await expect(page.getByTestId('voice-arrival-face').locator('img')).toHaveAttribute('alt', 'Abuelo Lucho');
});
