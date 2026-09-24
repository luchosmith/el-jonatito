// Caretaker quick log: tap the food, tap the amount, save. Under 15 seconds.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Board } from '../common/board.ts';
import { fmt12ampm } from '../../../shared/time.ts';
import type { LogEntry } from '../../../shared/types.ts';

const AMOUNTS: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, 'All']];
const EXTRA: { type: LogEntry['type']; emoji: string; label: string }[] = [
  { type: 'meds', emoji: '💊', label: 'Meds' },
  { type: 'toilet', emoji: '🚽', label: 'Toilet' },
  { type: 'sleep', emoji: '😴', label: 'Nap' },
];

export function QuickLog({ board }: { board: Board }) {
  const items = board.symbols.filter((s) => s.log_trackable && s.grid_page === 'food');
  const [pick, setPick] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const load = () => api.get<LogEntry[]>('/api/logs').then(setEntries);
  useEffect(() => void load(), []);

  const save = async () => {
    if (!pick) return;
    const extra = EXTRA.find((e) => e.type === pick);
    const sym = board.symbols.find((s) => s.id === pick);
    await api.post('/api/logs', extra ? { type: extra.type } : { type: sym?.category === 'drink' ? 'drink' : 'food', symbol_id: pick, amount });
    setPick(null);
    await load();
  };
  const mood = async (note: string) => {
    await api.post('/api/logs', { type: 'mood', note });
    await load();
  };
  const remove = async (id: number) => {
    await api.del(`/api/logs/${id}`);
    await load();
  };

  const pickedLabel = pick ? board.symbols.find((s) => s.id === pick)?.labels.en ?? EXTRA.find((e) => e.type === pick)?.label : '';

  return (
    <section className="quicklog" data-testid="quick-log">
      <div className="qbtns">
        {items.map((s) => (
          <button key={s.id} className={`qb ${pick === s.id ? 'sel' : ''}`} data-testid={`log-${s.id}`} onClick={() => setPick(s.id)}>
            {s.emoji}
            {s.badge_color && <i className="badge" style={{ background: s.badge_color }} />}
            <span>{s.labels.en}</span>
          </button>
        ))}
        {EXTRA.map((e) => (
          <button key={e.type} className={`qb ${pick === e.type ? 'sel' : ''}`} data-testid={`log-${e.type}`} onClick={() => setPick(e.type)}>
            {e.emoji}<span>{e.label}</span>
          </button>
        ))}
      </div>
      <div className="amt">
        {AMOUNTS.map(([v, l]) => (
          <button key={v} className={amount === v ? 'sel' : ''} data-testid={`amount-${v}`} onClick={() => setAmount(v)}>{l}</button>
        ))}
      </div>
      <div className="moods">
        {[['😊', 'happy'], ['😐', 'ok'], ['😣', 'upset']].map(([e, n]) => (
          <button key={n} className="qb" data-testid={`mood-${n}`} onClick={() => mood(n)}>{e}<span>{n}</span></button>
        ))}
      </div>
      <button className="save" data-testid="log-save" disabled={!pick} onClick={save}>
        Save {pick ? `· ${pickedLabel}` : ''}
      </button>

      <h3>Today</h3>
      <ul className="log-list" data-testid="log-list">
        {entries.map((e) => (
          <li key={e.id} data-testid="log-entry">
            <span>{board.symbols.find((s) => s.id === e.symbol_id)?.emoji ?? '•'} {board.symbols.find((s) => s.id === e.symbol_id)?.labels.en ?? e.note ?? e.type}</span>
            {e.amount != null && <span>{AMOUNTS.find(([v]) => v === e.amount)?.[1]}</span>}
            <time>{fmt12ampm(new Date(e.at))} · {e.entered_by_name}</time>
            <button className="link" onClick={() => remove(e.id)} aria-label="Delete">✖</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
