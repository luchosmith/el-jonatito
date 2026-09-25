import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, device, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('TALK: he taps Abuela Pilar\'s ear, his voice is recorded and arrives on her phone', async ({ page, browser, request }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await page.getByTestId('dock-pilar').click();
  const talk = page.getByTestId('zone-talk');
  await expect(talk).toContainText('TALK');
  await talk.click();
  await expect(talk).toHaveAttribute('data-state', 'recording');
  await expect(page.getByTestId('voice-sent')).toBeVisible({ timeout: 10_000 });

  const audio = pilar.page.getByTestId('inbox-message').first().getByTestId('message-audio');
  await expect(audio).toHaveAttribute('src', /\/api\/audio\/.+\.(webm|ogg|m4a)$/);
  const src = (await audio.getAttribute('src'))!;
  const p = await apiAs(request, 'pilar');
  const file = await p.get(src);
  expect(file.status()).toBe(200);
  expect((await file.body()).length).toBeGreaterThan(100);
  await pilar.context.close();
});

test('she answers with her voice; he hears it from the reply, then again from her voice shelf', async ({ page, browser }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }, 'pilar', { page: 'feel' }, 'happy']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();

  const msg = pilar.page.getByTestId('inbox-message').first();
  await msg.getByTestId('reply-voice').click();
  await pilar.page.waitForTimeout(1500);
  await msg.getByTestId('reply-voice').click();
  await expect(msg.getByTestId('my-replies')).toContainText('voice');

  await expect(page.getByTestId('reply-toast')).toHaveAttribute('data-kind', 'voice');
  const played = page.waitForResponse((r) => r.url().includes('/api/audio/') && r.status() < 300);
  await page.getByTestId('reply-listen').click();
  await played;
  await page.getByTestId('reply-close').click();

  // The same voice is on her shelf, marked new until he plays it.
  await expect(page.getByTestId('dock-voice-pilar')).toBeVisible();
  await page.getByTestId('dock-pilar').click();
  const tile = page.getByTestId('voice-tile').first();
  await expect(tile).toHaveAttribute('data-heard', 'no');
  // The same file the toast just played (the browser serves it from its cache now).
  await tile.click();
  await expect(tile).toHaveAttribute('data-heard', 'yes');
  await expect(page.getByTestId('dock-voice-pilar')).toHaveCount(0);
  await pilar.context.close();
});

test('with no voice notes yet, the shelf offers the default hello (no error)', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-larry').click();
  await expect(page.getByTestId('voice-tile')).toHaveCount(0);
  await page.getByTestId('voice-hello').click();
  await expect(page.getByTestId('voice-hello')).toHaveClass(/playing/);
});

test('voice uploads are checked (type and recipient)', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  expect((await child.raw('POST', '/api/messages/voice?to=pilar', FAKE_WEBM, 'text/plain')).status()).toBe(415);
  expect((await child.raw('POST', '/api/messages/voice?to=nobody', FAKE_WEBM, 'audio/webm')).status()).toBe(400);
  const ok = await child.raw('POST', '/api/messages/voice?to=pilar', FAKE_WEBM, 'audio/webm');
  expect(ok.status()).toBe(200);
});
