import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt12, fmt12ampm, fmtMinutes, inWindow, seasonOf } from '../shared/time.ts';

test('12-hour formatting', () => {
  assert.equal(fmt12(new Date(2026, 8, 23, 15, 5)), '3:05');
  assert.equal(fmt12(new Date(2026, 8, 23, 0, 30)), '12:30');
  assert.equal(fmt12ampm(new Date(2026, 8, 23, 12, 0)), '12:00 pm');
  assert.equal(fmt12ampm(new Date(2026, 8, 23, 9, 7)), '9:07 am');
  assert.equal(fmtMinutes(18 * 60 + 30), '6:30');
});

test('seasons by hemisphere', () => {
  assert.equal(seasonOf(new Date(2026, 8, 23)), 'autumn');
  assert.equal(seasonOf(new Date(2026, 0, 10)), 'winter');
  assert.equal(seasonOf(new Date(2026, 8, 23), 'south'), 'spring');
});

test('time windows that wrap midnight (sleep lock, quiet hours)', () => {
  const start = 20 * 60 + 30;
  const end = 7 * 60;
  assert.equal(inWindow(21 * 60, start, end), true);
  assert.equal(inWindow(3 * 60, start, end), true);
  assert.equal(inWindow(7 * 60, start, end), false);
  assert.equal(inWindow(15 * 60, start, end), false);
  assert.equal(inWindow(10 * 60, 9 * 60, 17 * 60), true);
});
