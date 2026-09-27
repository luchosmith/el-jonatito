// Time helpers. Everything shown to Jonatito uses a 12-hour clock.

const pad = (n: number) => String(n).padStart(2, '0');

/** "3:05" — 12-hour, no am/pm (child screens). */
export function fmt12(d: Date): string {
  return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
}

/** "3:05 pm" — 12-hour with am/pm (adult screens). */
export function fmt12ampm(d: Date): string {
  return `${fmt12(d)} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/** Minutes after midnight -> "7:30". */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${pad(min % 60)}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/** Meteorological seasons. */
export function seasonOf(d: Date, hemisphere: 'north' | 'south' = 'north'): Season {
  const order: Season[] = ['winter', 'spring', 'summer', 'autumn'];
  let idx = Math.floor(((d.getMonth() + 1) % 12) / 3);
  if (hemisphere === 'south') idx = (idx + 2) % 4;
  return order[idx];
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Is `min` (minutes after midnight) inside a window that may wrap midnight? */
export function inWindow(min: number, start: number, end: number): boolean {
  return start <= end ? min >= start && min < end : min >= start || min < end;
}

/** 'YYYY-MM-DD' of the local day. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
