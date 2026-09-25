// Everything he taps is logged; caretakers see it on 🕒 Today; notifications are batched.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { AFTERNOON, apiAs, build, device, login, resetDb, setClock } from './helpers.ts';

const LATER = (min: number) => new Date(new Date(AFTERNOON).getTime() + min * 60_000).toISOString();
const tick = async (request: APIRequestContext) => expect((await request.post('/api/test/tick')).ok()).toBeTruthy();

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('an unsent sentence shows on 🕒 Today as "he may have meant"; answering it reaches his tablet', async ({ page, browser, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('orbit-eat').click();
  await page.getByTestId('orbit-grapes').click(); // open at 3:40 (snack time)
  // The taps reach the server within a couple of seconds.
  const joyceApi = await apiAs(request, 'joyce');
  await expect.poll(async () => (await (await joyceApi.get('/api/moments')).json()).length, { timeout: 8000 }).toBe(1);

  // He walks away: 30 s later the moment ends as "not sent".
  await setClock(request, LATER(1));
  await tick(request);

  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await joyce.page.getByTestId('tab-today').click();
  const m = joyce.page.getByTestId('today-moment').first();
  await expect(m).toHaveAttribute('data-outcome', 'not_sent');
  await expect(m.getByTestId('today-meant')).toContainText('I want to eat grapes.');
  await joyce.page.getByTestId('today-not-sent').click();
  await expect(joyce.page.getByTestId('today-moment')).toHaveCount(1);

  await m.getByTestId('today-answer-yes').click();
  await expect(page.getByTestId('reply-toast')).toHaveAttribute('data-kind', 'yes');
  await expect(m.getByTestId('today-answered')).toContainText('Mommy Joyce');
  await joyce.context.close();
});

test('a sent sentence is one "sent" moment; friends cannot read the tap log', async ({ page, request }) => {
  await login(page, 'jonatito');
  await build(page, ['water', 'drink_f']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-delivered')).toBeVisible();
  const moments = await (await (await apiAs(request, 'joyce')).get('/api/moments')).json();
  const sent = moments.filter((e: { kind: string; moment?: { outcome: string } }) => e.kind === 'moment' && e.moment?.outcome === 'sent');
  expect(sent).toHaveLength(1);
  expect(sent[0].moment.sentence_en).toBe('I want to drink water.');
  expect(sent[0].moment.sent_to).toEqual(['mommy_joyce']);
  const pilar = await apiAs(request, 'pilar');
  expect((await pilar.get('/api/moments')).status()).toBe(403);
  expect((await pilar.post('/api/taps', [])).status()).toBe(403);
  const child = await apiAs(request, 'jonatito');
  expect((await child.post('/api/taps', [{ at: AFTERNOON, action: 'dance', screen: 'orbit' }])).status()).toBe(400);
  expect((await child.post('/api/taps', [{ at: AFTERNOON, action: 'add', screen: 'orbit', item_id: 'nope' }])).status()).toBe(400);
});

test('visiting a face without sending: that person gets a 💭, riding along with his next message', async ({ page, browser, request }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await page.getByTestId('orbit-pilar').click();
  await page.getByTestId('me-button').click();
  const joyceApi = await apiAs(request, 'joyce');
  await expect.poll(async () => (await (await joyceApi.get('/api/moments')).json()).length, { timeout: 8000 }).toBe(1);
  await setClock(request, LATER(1));
  await tick(request);
  await expect(pilar.page.getByTestId('notify-banner')).toHaveCount(0); // a 💭 alone never buzzes

  await page.getByTestId('orbit-pilar').click();
  await page.getByTestId('zone-love').click();
  const banner = pilar.page.getByTestId('notify-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId('notify-line')).toHaveCount(2);
  await expect(banner.locator('[data-kind="face"]')).toContainText('💭');
  await expect(banner.locator('[data-kind="message"]')).toContainText('I love you');
  await pilar.context.close();
});

test('no spam: the first message notifies, the next ones wait and arrive as one update', async ({ page, browser, request }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await build(page, ['water', 'drink_f']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();
  const banner = joyce.page.getByTestId('notify-banner');
  await expect(banner).toHaveAttribute('data-total', '1');
  await expect(banner).toContainText('I want to drink water.');
  await banner.getByRole('button', { name: 'Close' }).click();

  await build(page, ['smoothie']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();
  await build(page, ['smoothie']);
  await page.getByTestId('send').click();
  await expect(joyce.page.getByTestId('inbox-message')).toHaveCount(3); // the inbox is live
  await expect(banner).toHaveCount(0); // but nothing buzzed

  await setClock(request, LATER(10));
  await tick(request);
  await expect(banner).toHaveAttribute('data-total', '2');
  await expect(banner.getByTestId('notify-line')).toHaveCount(1);
  await expect(banner).toContainText('×2');
  await joyce.context.close();
});

test('a typed reply is shown and read aloud on his tablet', async ({ page, browser }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }, 'pilar', { page: 'feel' }, 'happy']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();
  const msg = pilar.page.getByTestId('inbox-message').first();
  await msg.getByTestId('reply-text-input').fill('¡Qué bueno, mi amor!');
  await msg.getByTestId('reply-text-send').click();
  await expect(page.getByTestId('reply-text')).toHaveText('“¡Qué bueno, mi amor!”');
  await expect(msg.getByTestId('my-replies')).toContainText('¡Qué bueno, mi amor!');
  await pilar.context.close();
});

test('notification settings: no grouping, or no 💭 at all', async ({ browser, request }) => {
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await pilar.page.getByTestId('tab-status').click();
  await pilar.page.getByTestId('batch-0').click();
  await expect(pilar.page.getByTestId('batch-0')).toHaveClass(/on/);
  await pilar.page.getByTestId('face-taps').uncheck();
  const prefs = await (await (await apiAs(request, 'pilar')).get('/api/notify-prefs')).json();
  expect(prefs).toEqual({ batch_min: 0, face_taps: false });
  expect((await (await apiAs(request, 'pilar')).put('/api/notify-prefs', { batch_min: 7 })).status()).toBe(400);
  await pilar.context.close();
});
