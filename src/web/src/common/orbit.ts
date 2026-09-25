// Orbit geometry. Slots are fixed: an item keeps its place for good, whatever else is added or hidden.
import type { CSSProperties } from 'react';

export const INNER_SLOTS = 8;
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

export function slotStyle(orbit: 'inner' | 'outer', slot: number): CSSProperties {
  const { rx, ry } = RADII[orbit];
  const th = slotAngle(orbit, slot);
  return { left: `${50 + rx * Math.sin(th)}%`, top: `${50 - ry * Math.cos(th)}%` };
}
