import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, device, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

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

test('she answers with her voice; he hears it from the reply and from the sound wave (LISTEN)', async ({ page, browser }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await page.getByTestId('page-people').click();
  await page.getByTestId('sym-pilar').click();
  await page.getByTestId('page-feel').click();
  await page.getByTestId('sym-happy').click();
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

  await page.getByTestId('dock-pilar').click();
  await expect(page.getByTestId('zone-listen')).toContainText('LISTEN');
  const lookup = page.waitForResponse((r) => r.url().endsWith('/api/people/pilar/voice'));
  await page.getByTestId('zone-listen').click();
  // Her last recorded message (the same file the toast just played, now served from cache)
  expect((await (await lookup).json()).url).toMatch(/\/api\/audio\//);
  await expect(page.getByTestId('zone-listen')).toHaveClass(/speaking/);
  await pilar.context.close();
});

test('LISTEN with no recorded message falls back to the default hello (no error)', async ({ page }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-larry').click();
  const lookup = page.waitForResponse((r) => r.url().endsWith('/api/people/larry/voice'));
  await page.getByTestId('zone-listen').click();
  expect((await (await lookup).json()).url).toBeNull();
  await expect(page.getByTestId('zone-listen')).toHaveClass(/speaking/);
});

test('voice uploads are checked (type and recipient)', async ({ request }) => {
  const child = await apiAs(request, 'jonatito');
  expect((await child.raw('POST', '/api/messages/voice?to=pilar', FAKE_WEBM, 'text/plain')).status()).toBe(415);
  expect((await child.raw('POST', '/api/messages/voice?to=nobody', FAKE_WEBM, 'audio/webm')).status()).toBe(400);
  const ok = await child.raw('POST', '/api/messages/voice?to=pilar', FAKE_WEBM, 'audio/webm');
  expect(ok.status()).toBe(200);
});
