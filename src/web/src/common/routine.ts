// What a routine slot shows on a given day.
import type { Board } from './board.ts';
import type { ScheduleDay, ScheduleItem } from '../../../shared/types.ts';

/** A routine slot on one day: what it shows that day (the day's pick, or the everyday picture). */
export function routinePicture(s: ScheduleItem, day: string, days: ScheduleDay[], board: Board) {
  const pick = days.find((d) => d.schedule_id === s.id && d.day === day);
  const item = (id: string | null | undefined) => (id ? board.items.find((it) => it.id === id) : undefined);
  if (pick?.photo_url) return { photo: pick.photo_url, emoji: s.symbol_emoji, label: pick.label ?? s.label, picked: true };
  const chosen = item(pick?.item_id);
  if (chosen) return { photo: chosen.photo_url, emoji: chosen.emoji ?? s.symbol_emoji, label: chosen.labels.en, picked: true };
  const def = item(s.symbol_id);
  return { photo: def?.photo_url ?? null, emoji: def && !def.photo_url ? def.emoji ?? s.symbol_emoji : s.symbol_emoji, label: s.label, picked: false };
}
