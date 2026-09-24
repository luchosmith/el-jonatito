// "My day": a plate that fills as he eats, a glass that fills as he drinks, and what happened today.
import { fmt12 } from '../../../shared/time.ts';
import type { LogEntry } from '../../../shared/types.ts';
import type { Board } from '../common/board.ts';

const MEALS = [
  { id: 'breakfast', until: 10.5 * 60, emoji: '🥞' },
  { id: 'lunch', until: 14.5 * 60, emoji: '🍝' },
  { id: 'snack', until: 17 * 60, emoji: '🍇' },
  { id: 'dinner', until: 24 * 60, emoji: '🍲' },
];
const TYPE_EMOJI: Record<string, string> = { meds: '💊', sleep: '😴', toilet: '🚽', mood: '🙂', activity: '🌳', food: '🍽️', drink: '💧' };
const GLASS_GOAL = 6;

function wedgePath(i: number) {
  const a0 = (i * Math.PI) / 2;
  const a1 = ((i + 1) * Math.PI) / 2;
  const p = (a: number) => `${100 + 70 * Math.sin(a)} ${100 - 70 * Math.cos(a)}`;
  return `M100 100 L${p(a0)} A70 70 0 0 1 ${p(a1)} Z`;
}

export function DayView({ logs, board }: { logs: LogEntry[]; board: Board }) {
  const mealAmount = MEALS.map(() => 0);
  let drinks = 0;
  for (const l of logs) {
    const d = new Date(l.at);
    const min = d.getHours() * 60 + d.getMinutes();
    if (l.type === 'food') {
      const idx = MEALS.findIndex((m) => min < m.until);
      mealAmount[idx] = Math.min(1, mealAmount[idx] + (l.amount ?? 1));
    }
    if (l.type === 'drink') drinks += 1;
  }
  const emojiFor = (l: LogEntry) => board.symbols.find((s) => s.id === l.symbol_id)?.emoji ?? TYPE_EMOJI[l.type] ?? '•';
  const labelFor = (l: LogEntry) => board.symbols.find((s) => s.id === l.symbol_id)?.labels.en ?? l.note ?? l.type;

  return (
    <div className="dayv" data-testid="day-view">
      <div className="panel center">
        <svg width="250" height="250" viewBox="0 0 200 200" data-testid="plate">
          <circle cx="100" cy="100" r="92" fill="#eef1f5" stroke="#cfd8e3" strokeWidth="4" />
          <circle cx="100" cy="100" r="70" fill="#fff" stroke="#e3e8ee" strokeWidth="2" />
          {MEALS.map((m, i) => (
            <g key={m.id} data-testid={`meal-${m.id}`} data-amount={mealAmount[i]}>
              {mealAmount[i] > 0 && <path d={wedgePath(i)} fill="#f39a45" opacity={0.3 + 0.6 * mealAmount[i]} />}
              <text x={100 + 42 * Math.sin((i + 0.5) * (Math.PI / 2))} y={106 - 42 * Math.cos((i + 0.5) * (Math.PI / 2))} fontSize="20" textAnchor="middle" opacity={mealAmount[i] ? 1 : 0.35}>
                {m.emoji}
              </text>
            </g>
          ))}
        </svg>
        <div className="glass" data-testid="glass" data-count={drinks}>
          <svg width="70" height="100" viewBox="0 0 70 100">
            <path d="M8 6 L62 6 L55 96 L15 96 Z" fill="#fff" stroke="#5aa4e6" strokeWidth="4" />
            <path d={`M${8 + 7 * (1 - Math.min(drinks, GLASS_GOAL) / GLASS_GOAL)} ${96 - 90 * (Math.min(drinks, GLASS_GOAL) / GLASS_GOAL)} L${62 - 7 * (1 - Math.min(drinks, GLASS_GOAL) / GLASS_GOAL)} ${96 - 90 * (Math.min(drinks, GLASS_GOAL) / GLASS_GOAL)} L55 96 L15 96 Z`} fill="#5aa4e6" opacity=".6" />
          </svg>
          <b>💧 {drinks}/{GLASS_GOAL}</b>
        </div>
      </div>
      <div className="panel">
        <div className="entries" data-testid="day-entries">
          {logs.length === 0 && <div className="entry muted">·</div>}
          {logs.map((l) => (
            <div key={l.id} className="entry" data-testid="day-entry" data-symbol={l.symbol_id ?? ''}>
              <span className="i">{emojiFor(l)}</span>
              {labelFor(l)}
              {l.amount != null && <span className="frac"><i style={{ width: `${l.amount * 100}%` }} /></span>}
              <span className="t">{fmt12(new Date(l.at))} · {l.entered_by_name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
