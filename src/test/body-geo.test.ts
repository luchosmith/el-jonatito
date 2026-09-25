import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_PARTS, painSentence } from '../shared/body.ts';
import { differentTime, flagOf, nearestCity, reachOf, searchCities, sleepsUntil, timeIn } from '../shared/geo.ts';
import type { Place } from '../shared/types.ts';

const part = (id: string) => BODY_PARTS.find((p) => p.id === id)!;

test('pain sentences in English and Spanish, singular and plural', () => {
  assert.equal(painSentence(part('tummy'), 3, 'en'), 'My tummy hurts a lot.');
  assert.equal(painSentence(part('tummy'), 3, 'es'), 'Me duele mucho la barriga.');
  assert.equal(painSentence(part('eyes'), 1, 'en'), 'My eyes hurt a little.');
  assert.equal(painSentence(part('eyes'), 5, 'es'), '¡Me duelen demasiado los ojos!');
  assert.equal(painSentence(part('head'), 0, 'en'), "My head doesn't hurt.");
  assert.equal(painSentence(part('head'), 0, 'es'), 'No me duele la cabeza.');
});

const home: Place = { place_label: 'Home', country_code: 'US', tz: 'America/New_York', lat: 40.8, lon: -74.2 };

test('same city, same country, abroad, unknown', () => {
  assert.equal(reachOf(home, { ...home, place_label: 'Newark', lat: 40.7, lon: -74.2 }), 'same_city');
  assert.equal(reachOf(home, { place_label: 'Miami', country_code: 'US', tz: 'America/New_York', lat: 25.8, lon: -80.2 }), 'same_country');
  assert.equal(reachOf(home, { place_label: 'Lima', country_code: 'PE', tz: 'America/Lima', lat: -12.1, lon: -77 }), 'abroad');
  assert.equal(reachOf(home, null), 'unknown');
});

test('their local time and "back in N sleeps"', () => {
  const now = new Date('2026-09-23T19:40:00Z'); // 3:40 pm in New York, 2:40 pm in Lima
  const lima = timeIn('America/Lima', now);
  assert.equal(`${lima.getHours()}:${lima.getMinutes()}`, '14:40');
  assert.equal(differentTime('America/New_York', 'America/Lima', now), true);
  assert.equal(differentTime('America/New_York', 'America/Toronto', now), false);
  assert.equal(sleepsUntil(new Date(2026, 8, 26, 12), new Date(2026, 8, 23, 15)), 3);
  assert.equal(sleepsUntil(new Date(2026, 8, 23, 20), new Date(2026, 8, 23, 15)), 0);
});

test('city list: search, nearest city, flags', () => {
  assert.equal(searchCities('lim')[0].name, 'Lima');
  assert.equal(searchCities('medell')[0].name, 'Medellín');
  assert.equal(nearestCity(40.74, -74.18).name, 'Newark');
  assert.equal(nearestCity(-12.1, -77).tz, 'America/Lima');
  assert.equal(flagOf('pe'), '🇵🇪');
});
