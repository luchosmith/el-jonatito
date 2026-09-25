// When is an item open? A caretaker can close an item outside a time window, after N a day,
// or for a while after it was last logged. Closed items always say *when* they open again.
import type { ItemRule } from './types.ts';
import { inWindow, minutesOfDay, startOfDay } from './time.ts';

export interface RuleContext {
  now: Date;
  /** when this item (or one of its aliases) was logged, any order */
  logs: Date[];
  /** routine (schedule item) id -> start minute of the day */
  routine: Map<number, number>;
  /** minute of the day when "tomorrow" starts for daily limits (wake-up) */
  dayStartMin: number;
}

export interface RuleResult {
  closed_until: Date | null;
  closed_by: ItemRule['kind'] | null;
}

const dayOk = (days: number | null, d: Date) => days == null || (days & (1 << d.getDay())) !== 0;

function windowOf(rule: ItemRule, routine: Map<number, number>): [number, number] | null {
  if (rule.routine_item_id != null) {
    const start = routine.get(rule.routine_item_id);
    return start == null ? null : [start, start + (rule.routine_open_min ?? 30)];
  }
  if (rule.start_min != null && rule.end_min != null) return [rule.start_min, rule.end_min];
  return null;
}

/** When a window rule next opens, or null when it is open right now (or has no window). */
export function windowOpensAt(rule: ItemRule, ctx: RuleContext): Date | null {
  const w = windowOf(rule, ctx.routine);
  if (!w) return null;
  const [start, end] = w;
  if (dayOk(rule.days, ctx.now) && inWindow(minutesOfDay(ctx.now), start % 1440, end % 1440)) return null;
  for (let d = 0; d <= 7; d++) {
    const at = startOfDay(ctx.now);
    at.setDate(at.getDate() + d);
    at.setMinutes(start);
    if (at > ctx.now && dayOk(rule.days, at)) return at;
  }
  return null;
}

/** Combines every rule: the item is closed until the latest time any of them opens it again. */
export function evaluateRules(rules: ItemRule[], ctx: RuleContext, blockingOnly = true): RuleResult {
  let until: Date | null = null;
  let by: ItemRule['kind'] | null = null;
  const bump = (at: Date, kind: ItemRule['kind']) => {
    if (!until || at > until) {
      until = at;
      by = kind;
    }
  };
  const past = ctx.logs.filter((t) => t <= ctx.now);
  const midnight = startOfDay(ctx.now);

  for (const r of rules) {
    if (blockingOnly && !r.blocks) continue;
    if (r.kind === 'window') {
      const opens = windowOpensAt(r, ctx);
      if (opens) bump(opens, 'window');
    } else if (r.kind === 'limit' && r.max_per_day) {
      if (past.filter((t) => t >= midnight).length >= r.max_per_day) {
        const tomorrow = startOfDay(ctx.now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setMinutes(ctx.dayStartMin);
        bump(tomorrow, 'limit');
      }
    } else if (r.kind === 'interval' && r.min_interval_min) {
      const last = past.reduce<Date | null>((a, t) => (!a || t > a ? t : a), null);
      if (last) {
        const opens = new Date(last.getTime() + r.min_interval_min * 60_000);
        if (opens > ctx.now) bump(opens, 'interval');
      }
    }
  }
  return { closed_until: until, closed_by: by };
}
