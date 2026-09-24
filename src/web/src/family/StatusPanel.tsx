import { useState } from 'react';
import { api } from '../api.ts';
import type { Board } from '../common/board.ts';
import type { AvailabilityStatus, User } from '../../../shared/types.ts';

/** Feeds the availability ring around your face on Jonatito's tablet. */
export function StatusPanel({ board, user }: { board: Board; user: User }) {
  const me = board.people.find((p) => p.id === user.person_id);
  const [status, setStatus] = useState<AvailabilityStatus>(me?.status ?? 'available');
  const [minutes, setMinutes] = useState(60);

  const set = async (s: AvailabilityStatus) => {
    await api.put('/api/availability', { status: s, ...(s !== 'available' ? { until_minutes: minutes } : {}) });
    setStatus(s);
  };

  return (
    <section className="status-panel">
      <div className="stat">
        {(['available', 'busy', 'away'] as const).map((s) => (
          <button key={s} className={status === s ? 'sel' : ''} data-testid={`status-${s}`} onClick={() => set(s)}>
            {s === 'available' ? '🟢 Free' : s === 'busy' ? '🟡 Busy' : '⚫ Away'}
          </button>
        ))}
      </div>
      <label className="for">
        for
        <select data-testid="status-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[15, 30, 45, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
        </select>
      </label>
      <p className="muted" data-testid="status-current">Now: {status}</p>
    </section>
  );
}
