import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativePhrase, timeOffsetMin, timeOffsetPx, timeReach, zoneOf, ZONE } from '../shared/timescale.ts';

test('relative time: monotonic, zones at an hour / a day / two weeks, never off the screen', () => {
  const mins = [0, 1, 15, 30, 59, 60, 61, 120, 600, 1440, 1441, 3 * 1440, 14 * 1440, 30 * 1440, 200 * 1440, 365 * 1440, 900 * 1440];
  for (let i = 1; i < mins.length; i++) assert.ok(timeReach(mins[i]) >= timeReach(mins[i - 1]), `monotonic at ${mins[i]}`);
  assert.equal(timeReach(0), 0);
  assert.ok(Math.abs(timeReach(60) - ZONE.minutes) < 1e-9);
  assert.ok(Math.abs(timeReach(1440) - ZONE.hours) < 1e-9);
  assert.ok(Math.abs(timeReach(14 * 1440) - ZONE.days) < 1e-9);
  assert.ok(timeReach(10 * 365 * 1440) <= 1);
  assert.equal(zoneOf(-20), 'minutes');
  assert.equal(zoneOf(300), 'hours');
  assert.equal(zoneOf(-3 * 1440), 'days');
  assert.equal(zoneOf(60 * 1440), 'seasons');
});

test('the minutes zone is roomy: 15 minutes apart is at least a 40 px icon on a 400 px half', () => {
  assert.ok(timeOffsetPx(30, 400) - timeOffsetPx(15, 400) >= 40 - 1e-9);
  assert.ok(timeOffsetPx(-10, 400) < 0, 'the past is on the left');
});

test('the scale read backwards gives the offset back (for dragging)', () => {
  for (const m of [-200 * 1440, -3 * 1440, -300, -25, 0, 7, 45, 90, 700, 5 * 1440, 60 * 1440]) {
    const back = timeOffsetMin(timeOffsetPx(m, 380), 380);
    assert.ok(Math.abs(back - m) <= Math.max(0.5, Math.abs(m) * 1e-6), `${m} -> ${back}`);
  }
});

test('relative phrases', () => {
  assert.equal(relativePhrase(25 * 60_000), 'in 25 min');
  assert.equal(relativePhrase(-3 * 3600_000), '3 h ago');
  assert.equal(relativePhrase(1 * 86_400_000), 'in 1 sleep');
  assert.equal(relativePhrase(3 * 86_400_000), 'in 3 sleeps');
  assert.equal(relativePhrase(21 * 86_400_000), 'in 3 weeks');
  assert.equal(relativePhrase(-120 * 86_400_000), '4 months ago');
});

test('icons: centred on their time; a crowded one moves outwards, then up; the rest wait', async () => {
  const { placeIcons } = await import('../shared/timescale.ts');
  const out = placeIcons([
    { key: 'bath', dm: 25, rank: 0 },
    { key: 'breakfast', dm: 27, rank: 0 },
    { key: 'past', dm: -10, rank: 0 },
    { key: 'school', dm: 85, rank: 2 },
    { key: 'a', dm: 86, rank: 2 },
    { key: 'lunch', dm: 87, rank: 2 },
    { key: 'b', dm: 88, rank: 2 },
    { key: 'c', dm: 89, rank: 2 },
  ], 800, 104, 88);
  const by = Object.fromEntries(out.map((o) => [o.key, o]));
  assert.equal(by.bath.x, by.bath.x0, 'the closest sits exactly on its time');
  assert.ok(by.breakfast.x > by.bath.x + by.bath.size / 2, 'breakfast right after bath, to its right');
  assert.equal(by.breakfast.top, by.bath.top, 'same row');
  assert.ok(by.past.x < 400);
  assert.ok(by.lunch.top < by.school.top, 'a crowded one goes up a row');
  assert.ok(out.length < 8, 'one that cannot sit near its time is left out');
});
