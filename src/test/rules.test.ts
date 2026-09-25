import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules, type RuleContext } from '../shared/rules.ts';
import type { ItemRule } from '../shared/types.ts';

const at = (hhmm: string, day = 23) => new Date(`2026-09-${day}T${hhmm}:00`);
const rule = (r: Partial<ItemRule>): ItemRule => ({
  id: 1, item_id: 'grapes', kind: 'window', blocks: true, days: null, start_min: null, end_min: null, routine_item_id: null,
  routine_open_min: null, max_per_day: null, min_interval_min: null, suggest_item_id: null, ...r,
});
const ctx = (now: Date, logs: Date[] = []): RuleContext => ({ now, logs, routine: new Map([[6, 15 * 60]]), dayStartMin: 7 * 60 });

test('a snack-time window is open during the snack and closed until the next one otherwise', () => {
  const snack = rule({ routine_item_id: 6, routine_open_min: 45 });
  assert.deepEqual(evaluateRules([snack], ctx(at('15:20'))), { closed_until: null, closed_by: null });
  const before = evaluateRules([snack], ctx(at('14:00')));
  assert.equal(before.closed_until?.getTime(), at('15:00').getTime());
  assert.equal(before.closed_by, 'window');
  // after the snack: tomorrow's snack
  assert.equal(evaluateRules([snack], ctx(at('16:00'))).closed_until?.getTime(), at('15:00', 24).getTime());
});

test('fixed windows respect days of the week', () => {
  // 2026-09-23 is a Wednesday; open only on Saturdays (bit 6)
  const saturdays = rule({ start_min: 9 * 60, end_min: 12 * 60, days: 1 << 6 });
  assert.equal(evaluateRules([saturdays], ctx(at('10:00'))).closed_until?.getTime(), at('09:00', 26).getTime());
});

test('a daily limit closes the item until tomorrow morning', () => {
  const limit = rule({ kind: 'limit', max_per_day: 2 });
  assert.equal(evaluateRules([limit], ctx(at('12:00'), [at('08:00')])).closed_until, null);
  const r = evaluateRules([limit], ctx(at('12:00'), [at('08:00'), at('11:00'), at('20:00', 22)]));
  assert.equal(r.closed_until?.getTime(), at('07:00', 24).getTime());
  assert.equal(r.closed_by, 'limit');
});

test('an interval closes the item for a while after it was eaten', () => {
  const interval = rule({ kind: 'interval', min_interval_min: 60 });
  assert.equal(evaluateRules([interval], ctx(at('12:00'), [at('11:30')])).closed_until?.getTime(), at('12:30').getTime());
  assert.equal(evaluateRules([interval], ctx(at('12:00'), [at('10:30')])).closed_until, null);
});

test('reminder-only rules never close; the latest opening wins when several do', () => {
  const reminder = rule({ kind: 'interval', min_interval_min: 60, blocks: false });
  assert.equal(evaluateRules([reminder], ctx(at('12:00'), [at('11:30')])).closed_until, null);
  const both = [rule({ start_min: 12 * 60 + 15, end_min: 13 * 60 }), rule({ id: 2, kind: 'interval', min_interval_min: 60 })];
  const r = evaluateRules(both, ctx(at('12:00'), [at('11:50')]));
  assert.equal(r.closed_until?.getTime(), at('12:50').getTime());
  assert.equal(r.closed_by, 'interval');
});
