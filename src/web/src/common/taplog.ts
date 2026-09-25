// Every tap on the tablet is logged (caretakers see it on 🕒 Today). Taps are queued and sent in
// small batches; if the network is down they wait and are retried.
import { api } from '../api.ts';
import type { LoggedTap, TapInput } from '../../../shared/types.ts';

const queue: TapInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sending: Promise<void> | null = null;

export function logTap(action: LoggedTap, screen: string, ids: { item_id?: string | null; person_id?: string | null } = {}, detail?: Record<string, unknown>) {
  queue.push({ at: new Date().toISOString(), action, screen, item_id: ids.item_id ?? null, person_id: ids.person_id ?? null, detail: detail ?? null });
  if (!timer) timer = setTimeout(() => void flushTaps(), 1500);
}

/** Sends everything queued now (called before a message goes out, so the moment is complete). */
export async function flushTaps(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (sending) await sending;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  sending = api
    .post('/api/taps', batch as unknown as object)
    .then(() => undefined)
    .catch(() => {
      queue.unshift(...batch);
      if (!timer) timer = setTimeout(() => void flushTaps(), 10_000);
    })
    .finally(() => {
      sending = null;
    });
  await sending;
  if (queue.length && !timer) timer = setTimeout(() => void flushTaps(), 1500);
}
