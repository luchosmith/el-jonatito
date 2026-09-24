import { expect, test } from '@playwright/test';
import { AFTERNOON, apiAs, build, device, login, resetDb, setClock } from './helpers.ts';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await setClock(request, AFTERNOON, [page]);
});

test('Jonatito asks Mommy Joyce for pancakes; she gets it live and answers Yes', async ({ page, browser }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await login(page, 'jonatito');

  await build(page, [{ page: 'people' }, 'mommy_joyce', { page: 'food' }, 'pancakes', 'eat_f']);
  await page.getByTestId('send').click();

  const card = page.getByTestId('dispatch-card');
  await expect(card.getByTestId('sentence')).toContainText('Mommy Joyce, I want to eat pancakes.');
  await expect(card.getByTestId('note-delivered')).toHaveAttribute('data-person', 'mommy_joyce');

  // Arrives on Joyce's phone without a reload (server-sent events)
  const msg = joyce.page.getByTestId('inbox-message').first();
  await expect(msg.getByTestId('message-sentence')).toContainText('Mommy Joyce, I want to eat pancakes.');
  await msg.getByTestId('reply-yes').click();

  await expect(page.getByTestId('reply-toast')).toHaveAttribute('data-kind', 'yes');
  await expect(page.getByTestId('reply-kind-yes')).toBeVisible();
  await page.getByTestId('card-ok').click();
  await expect(page.getByTestId('strip-token')).toHaveCount(0);
  await joyce.context.close();
});

test('"Wait 5 min" comes back as a 12-hour clock showing when', async ({ page, browser }) => {
  const joyce = await device(browser, 'joyce', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }, 'mommy_joyce', { page: 'play' }, 'ball']);
  await page.getByTestId('send').click();
  await page.getByTestId('card-ok').click();

  await joyce.page.getByTestId('inbox-message').first().getByTestId('reply-wait').click();
  const toast = page.getByTestId('reply-toast');
  await expect(toast).toHaveAttribute('data-kind', 'wait');
  await expect(toast.locator('svg.clock12')).toHaveAttribute('aria-label', '3:45');
  await expect(toast).toContainText('3:45');
  await joyce.context.close();
});

test('a busy person still gets the message, and he can pick someone free instead', async ({ page, browser, request }) => {
  const lucho = await apiAs(request, 'lucho');
  await lucho.put('/api/availability', { status: 'busy', until_minutes: 45 });
  const pilar = await device(browser, 'pilar', { clock: AFTERNOON });
  await login(page, 'jonatito');

  await build(page, [{ page: 'people' }, 'lucho', { page: 'food' }, 'grapes', 'eat_f']);
  await page.getByTestId('send').click();
  const busy = page.getByTestId('note-busy');
  await expect(busy).toBeVisible();
  await expect(busy.locator('svg.clock12')).toHaveAttribute('aria-label', '4:25');
  await expect(busy.getByTestId('alt-lucho')).toHaveCount(0);
  await expect(busy.getByTestId('alt-mommy_joyce')).toBeVisible();

  // Lucho has it waiting in his inbox
  const inbox = await (await lucho.get('/api/messages')).json();
  expect(inbox[0].sentence_en).toBe('Abuelo Lucho, I want to eat grapes.');

  // Re-send to Abuela Pilar from the card
  await busy.getByTestId('alt-pilar').click();
  await expect(page.getByTestId('note-delivered')).toHaveAttribute('data-person', 'pilar');
  await expect(pilar.page.getByTestId('inbox-message').first()).toBeVisible();
  await pilar.context.close();
});

test('a message with no person goes to the caretaker on duty', async ({ page, request }) => {
  await login(page, 'jonatito');
  await build(page, [{ page: 'drink' }, 'water_d', 'drink_d']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('note-delivered')).toHaveAttribute('data-person', 'mommy_joyce');
  const joyce = await apiAs(request, 'joyce');
  const inbox = await (await joyce.get('/api/messages')).json();
  expect(inbox[0].sentence_en).toBe('I want to drink water.');
  expect(inbox[0].sentence_es).toBe('Quiero tomar agua.');
});

test('the face zones send social messages (COME SEE)', async ({ page, request }) => {
  await login(page, 'jonatito');
  await page.getByTestId('dock-larry').click();
  await page.getByTestId('zone-come-see').click();
  await expect(page.getByTestId('sentence')).toContainText('Larry, come see!');
  const larry = await apiAs(request, 'larry');
  const inbox = await (await larry.get('/api/messages')).json();
  expect(inbox[0].sentence_es).toBe('Larry, ven a ver!');
});

test('a friend can answer from the inbox and sees what they replied', async ({ page, browser }) => {
  const tintin = await device(browser, 'tintin', { clock: AFTERNOON });
  await login(page, 'jonatito');
  await build(page, [{ page: 'people' }, 'tintin', 'lexi', { page: 'action' }, 'play']);
  await page.getByTestId('send').click();
  await expect(page.getByTestId('sentence')).toContainText('TinTin, I want to play with Lexi (SLUT).');
  const msg = tintin.page.getByTestId('inbox-message').first();
  await msg.getByTestId('reply-no').click();
  await expect(msg.getByTestId('my-replies')).toContainText('no');
  await expect(page.getByTestId('reply-kind-no')).toBeVisible();
  await tintin.context.close();
});
