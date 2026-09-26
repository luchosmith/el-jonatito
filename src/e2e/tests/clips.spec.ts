// Saved clips: a caretaker names a recording once ("I'll be right there") and sends it again with one tap.
import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, device, FAKE_WEBM, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('record with a name, then send it again from "My clips": it pops up on his tablet again', async ({ page, browser }) => {
  await login(page, 'jonatito');
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  const fab = joyce.page.getByTestId('rec-fab');
  await fab.click();
  await joyce.page.waitForTimeout(1200);
  await fab.click();
  await joyce.page.getByTestId('rec-label').fill("I'll be right there");
  await joyce.page.getByTestId('rec-send').click();
  await expect(page.getByTestId('voice-arrival')).toBeVisible();
  await page.getByTestId('voice-arrival-face').click(); // he goes to her page; the pop-up is done
  await page.getByTestId('me-button').click();

  await joyce.page.getByTestId('tab-jonatito').click();
  const clip = joyce.page.getByTestId('clip').first();
  await expect(clip).toHaveAttribute('data-label', "I'll be right there");
  await clip.getByTestId('clip-send').click();
  await expect(clip.getByTestId('clip-send')).toHaveText('✔ Sent');
  await expect(page.getByTestId('voice-arrival')).toBeVisible(); // a new message, same voice
  await expect(joyce.page.getByTestId('voice-mine-item')).toHaveCount(2);
  await expect(joyce.page.getByTestId('clip')).toHaveCount(1); // still one clip: resends share the sound
  await joyce.context.close();
});

test('name an older recording afterwards with ✏️', async ({ browser, request }) => {
  const pilar = await apiAs(request, 'pilar');
  await pilar.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm');
  const p = await device(browser, 'pilar', { clock: AFTERNOON });
  await p.page.getByTestId('tab-jonatito').click();
  const clip = p.page.getByTestId('clip').first();
  await expect(clip).toHaveAttribute('data-label', '');
  await clip.getByTestId('clip-label').click();
  await p.page.getByTestId('clip-label-input').fill('Te quiero mucho');
  await p.page.getByTestId('clip-label-save').click();
  await expect(p.page.getByTestId('clip').first()).toHaveAttribute('data-label', 'Te quiero mucho');
  await p.context.close();
});

test('"Voice reply" lists saved clips; one tap answers with it', async ({ page, browser, request }) => {
  const pilarApi = await apiAs(request, 'pilar');
  const saved = await (await pilarApi.raw('POST', '/api/voice-notes?label=Ya%20voy%2C%20mi%20amor', FAKE_WEBM, 'audio/webm')).json();
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }, 'pilar', { page: 'feel' }, 'happy']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();

  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  const msg = pilar.page.getByTestId('inbox-message').first();
  await msg.getByTestId('reply-voice').click();
  const clip = msg.getByTestId('voice-picker').getByTestId('clip').first();
  await expect(clip).toHaveAttribute('data-label', 'Ya voy, mi amor');
  await clip.getByTestId('clip-send').click();
  await expect(msg.getByTestId('my-replies')).toContainText('voice');
  await expect(page.getByTestId('reply-toast')).toHaveAttribute('data-kind', 'voice');
  // The same sound file, not a new upload.
  const inbox = await (await pilarApi.get('/api/messages')).json();
  expect(inbox[0].replies[0].audio_url).toBe(saved.audio_url);
  await pilar.context.close();
});

test('only the sender can name or resend a clip', async ({ request }) => {
  const pilar = await apiAs(request, 'pilar');
  const joyce = await apiAs(request, 'joyce');
  const n = await (await pilar.raw('POST', '/api/voice-notes', FAKE_WEBM, 'audio/webm')).json();
  expect((await joyce.patch(`/api/voice-notes/${n.id}`, { label: 'x' })).status()).toBe(403);
  expect((await joyce.post(`/api/voice-notes/${n.id}/resend`)).status()).toBe(403);
  expect((await pilar.patch(`/api/voice-notes/${n.id}`, { pinned: true })).status()).toBe(403);
  expect((await pilar.patch(`/api/voice-notes/${n.id}`, { label: 'Hola' })).status()).toBe(200);
  expect((await (await joyce.get('/api/voice-notes/mine')).json())).toEqual([]);
  expect((await (await apiAs(request, 'jonatito')).get('/api/voice-notes/mine')).status()).toBe(403);
});
