// The timeline as a time compass (v0.9): NOW in the centre, the next minutes get most of the room,
// then hours, days and seasons bunch towards the edges. Not to scale, but monotonic, so dragging and
// "is it before or after" always stay right.

export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;
export const TWO_WEEKS = 14 * MIN_PER_DAY;
export const ONE_YEAR = 365 * MIN_PER_DAY;

/** Zone edges, as a share of half the timeline. */
export const ZONE = { minutes: 0.4, hours: 0.66, days: 0.84, edge: 0.985 } as const;
export type TimeZoneName = 'minutes' | 'hours' | 'days' | 'seasons';

/** |minutes| from the focus time -> share of half the timeline (0 = centre). */
export function timeReach(absMin: number): number {
  const a = Math.abs(absMin);
  if (a <= MIN_PER_HOUR) return (ZONE.minutes * a) / MIN_PER_HOUR; // minutes: linear
  if (a <= MIN_PER_DAY) return ZONE.minutes + (ZONE.hours - ZONE.minutes) * (Math.log(a / 60) / Math.log(24)); // hours
  if (a <= TWO_WEEKS) return ZONE.hours + (ZONE.days - ZONE.hours) * (Math.log(a / MIN_PER_DAY) / Math.log(14)); // days
  return ZONE.days + (ZONE.edge - ZONE.days) * Math.min(1, Math.log(a / TWO_WEEKS) / Math.log(ONE_YEAR / TWO_WEEKS)); // seasons
}

/** Minutes from the focus (negative = earlier) -> px from the centre (negative = left). */
export const timeOffsetPx = (minutes: number, halfWidth: number) => Math.sign(minutes) * timeReach(minutes) * halfWidth;

/** px from the centre -> minutes from the focus: the scale read backwards (for dragging). */
export function timeOffsetMin(px: number, halfWidth: number): number {
  if (!px || halfWidth <= 0) return 0;
  const f = Math.min(ZONE.edge, Math.abs(px) / halfWidth);
  let lo = 0;
  let hi = ONE_YEAR;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (timeReach(mid) < f) lo = mid;
    else hi = mid;
  }
  return Math.sign(px) * lo;
}

export function zoneOf(absMin: number): TimeZoneName {
  const a = Math.abs(absMin);
  return a <= MIN_PER_HOUR ? 'minutes' : a <= MIN_PER_DAY ? 'hours' : a <= TWO_WEEKS ? 'days' : 'seasons';
}

/** "in 25 min", "3 h ago", "in 2 sleeps", "in 3 weeks", "4 months ago" (adult-readable; the tablet shows pictures). */
export function relativePhrase(ms: number): string {
  const m = Math.round(ms / 60_000);
  const a = Math.abs(m);
  if (a < 1) return 'now';
  const txt = a < 60 ? `${a} min`
    : a < MIN_PER_DAY ? `${Math.round(a / 60)} h`
    : a < TWO_WEEKS ? `${Math.round(a / MIN_PER_DAY)} ${Math.round(a / MIN_PER_DAY) === 1 ? 'sleep' : 'sleeps'}`
    : a < 60 * MIN_PER_DAY ? `${Math.round(a / (7 * MIN_PER_DAY))} weeks`
    : `${Math.round(a / (30 * MIN_PER_DAY))} months`;
  return m > 0 ? `in ${txt}` : `${txt} ago`;
}

// ---- Laying icons out on the line --------------------------------------------------------------
export interface IconIn {
  key: string;
  /** minutes from the focus time */
  dm: number;
  /** 0 = within the hour, 1 = planned events and seasons, 2 = routine and what happened */
  rank: number;
  big?: boolean;
}
export interface IconOut {
  key: string;
  /** where its time is */
  x0: number;
  /** where the icon's centre is (x0 unless it had to move) */
  x: number;
  top: number;
  size: number;
}

export const ICON_SIZE: Record<TimeZoneName, number> = { minutes: 50, hours: 38, days: 30, seasons: 26 };

/**
 * Closest first (by rank, then distance). An icon sits with its centre on its time; if that spot is
 * taken it moves outwards (later -> right, earlier -> left), then onto the upper row; if it still
 * can't sit near its time it is left out (he sees it when he scrolls closer).
 */
export function placeIcons(items: IconIn[], width: number, height: number, baseline: number): IconOut[] {
  const half = width / 2;
  const placed: IconOut[] = [];
  const clash = (x: number, top: number, size: number) =>
    placed.some((o) => Math.abs(o.x - x) < (o.size + size) / 2 + 2 && top < o.top + o.size && o.top < top + size);
  const sorted = [...items].sort((a, b) => a.rank - b.rank || Math.abs(a.dm) - Math.abs(b.dm));
  for (const it of sorted) {
    const zone = zoneOf(it.dm);
    const size = ICON_SIZE[zone] + (it.big && (zone === 'minutes' || zone === 'hours') ? 14 : 0);
    const x0 = half + timeOffsetPx(it.dm, half);
    const side = it.dm >= 0 ? 1 : -1;
    const reach = it.rank === 0 ? 90 : 40;
    const rows = [baseline - size, Math.min(3, baseline - size)];
    let spot: IconOut | null = null;
    for (const top of rows) {
      for (let shift = 0; shift <= reach && !spot; shift += 4) {
        const x = x0 + side * shift;
        if (x < size / 2 || x > width - size / 2) break;
        if (!clash(x, top, size)) spot = { key: it.key, x0, x, top, size };
      }
      if (spot) break;
    }
    if (spot && spot.top + spot.size <= height) placed.push(spot);
  }
  return placed;
}
