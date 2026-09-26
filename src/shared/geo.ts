// Where people are, compared with Jonatito: distance, "same city / same country / abroad",
// their local time, and "back in N sleeps".
import type { Place } from './types.ts';
import { CITIES, type City } from './cities.ts';

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Reach = 'same_city' | 'same_country' | 'abroad' | 'unknown';

/** Within ~60 km counts as the same city (a car ride). */
export function reachOf(home: Place, p: Place | null | undefined): Reach {
  if (!p) return 'unknown';
  if (distanceKm(home, p) < 60) return 'same_city';
  return p.country_code === home.country_code ? 'same_country' : 'abroad';
}

/** 🇵🇪 from "PE". */
export function flagOf(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return '📍';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Coordinates are stored rounded to 0.1° (about 10 km): city-level only. */
export const coarse = (x: number) => Math.round(x * 10) / 10;

export function nearestCity(lat: number, lon: number): City {
  let best = CITIES[0];
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = distanceKm({ lat, lon }, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function searchCities(q: string, limit = 8): City[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const n = norm(q.trim());
  if (!n) return [];
  const starts = CITIES.filter((c) => norm(c.name).startsWith(n));
  const has = CITIES.filter((c) => !starts.includes(c) && norm(c.name).includes(n));
  return [...starts, ...has].slice(0, limit);
}

/** Wall-clock time in another time zone, as a Date whose getHours()/getMinutes() read that time. */
export function timeIn(tz: string, now: Date): Date {
  try {
    return new Date(now.toLocaleString('en-US', { timeZone: tz }));
  } catch {
    return now;
  }
}

/** Different wall-clock time from home right now? */
export function differentTime(tzA: string, tzB: string, now: Date): boolean {
  const a = timeIn(tzA, now);
  const b = timeIn(tzB, now);
  return a.getHours() !== b.getHours() || a.getMinutes() !== b.getMinutes();
}

/** Nights between now and `until` (a "back on" date): 0 = today. */
export function sleepsUntil(until: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(until.getFullYear(), until.getMonth(), until.getDate());
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

// ---- The places compass (v0.8): relative space on the earth under his feet -----------------------
/** Where the 🚗 and ✈️ lines sit, as a share of half the screen from the centre. */
export const COMPASS_CAR = 0.18;
export const COMPASS_PLANE = 0.58;

/**
 * Distance (km) -> how far from the centre, as a share of half the screen. Not to scale: under 2 km
 * (walk) grows with distance, 2–150 km (drive) on a log scale, farther (fly) bunches at the edges.
 */
export function compassReach(km: number): number {
  if (km < 2) return 0.1 + (COMPASS_CAR - 0.13) * (km / 2);
  if (km < 150) return COMPASS_CAR + 0.06 + (COMPASS_PLANE - COMPASS_CAR - 0.12) * (Math.log(km / 2) / Math.log(75));
  return COMPASS_PLANE + 0.07 + 0.28 * Math.min(1, Math.log(km / 150) / Math.log(120));
}

/** Left (-1, west) or right (+1, east) of home. */
export const compassSide = (home: { lon: number }, p: { lon: number }) => (p.lon >= home.lon ? 1 : -1);

/** Horizontal position in % of the width (50 = home). */
export function compassX(home: { lat: number; lon: number }, p: { lat: number; lon: number }): number {
  return 50 + compassSide(home, p) * compassReach(distanceKm(home, p)) * 50;
}
