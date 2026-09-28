// Orbit geometry. Slots are fixed: an item keeps its place for good, whatever else is added or hidden.
import type { CSSProperties } from 'react';

export const INNER_SLOTS = 8;
/** A sub-orbit (Eat -> foods) holds more: a loose cloud of spots around him, not a ring. */
export const SUB_SLOTS = 10;
export const OUTER_SLOTS = 10;
/** 12:00 crowds the inner orbit on a landscape screen; 6:00 is where his ground pin sits. */
export const RESERVED_OUTER = [0, 5];

/** Ellipse radii in % of the stage (landscape tablet). */
const RADII = { inner: { rx: 20, ry: 30 }, outer: { rx: 40, ry: 38 } } as const;

/** Inner slots start half a step past 12:00 so nothing sits straight above or below his face. */
export function slotAngle(orbit: 'inner' | 'outer', slot: number): number {
  const n = orbit === 'inner' ? INNER_SLOTS : OUTER_SLOTS;
  return ((orbit === 'inner' ? slot + 0.5 : slot) * 2 * Math.PI) / n;
}

/**
 * The foods' cloud (% of the stage, landscape tablet): five spots on each side of his face, clear of the
 * clock above him, his face, the Eat button and the "next food" card; each spot is fixed for good.
 * Clockwise from the top right; slot 0 is the one next to the clock.
 */
const CLOUD: [number, number][] = [
  [62.5, 24.9], [73.4, 21.5], [68, 50.9], [73.8, 76.9], [62.5, 78.1],
  [37.5, 78.1], [26.2, 79.2], [32, 50.9], [26.6, 22.6], [37.5, 24.9],
];

export const slotCount = (parentId: string | null) => (parentId ? SUB_SLOTS : INNER_SLOTS);

/** Where a slot is drawn: the ring for the main orbit, the cloud for a sub-orbit. */
export function placeStyle(parentId: string | null, slot: number): CSSProperties {
  if (!parentId) return slotStyle('inner', slot);
  const [x, y] = CLOUD[slot % SUB_SLOTS];
  return { left: `${x}%`, top: `${y}%` };
}

export function slotStyle(orbit: 'inner' | 'outer', slot: number): CSSProperties {
  const { rx, ry } = RADII[orbit];
  const th = slotAngle(orbit, slot);
  return { left: `${50 + rx * Math.sin(th)}%`, top: `${50 - ry * Math.cos(th)}%` };
}
