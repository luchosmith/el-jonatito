import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import type { AvailabilityStatus, User } from '../../../shared/types.ts';

const LABEL: Record<AvailabilityStatus, string> = { on_duty: '🛡️ On duty', available: '🟢 Free', busy: '🟡 Busy', away: '⚫ Away' };

/** Feeds the availability ring around your face on Jonatito's tablet. Caretakers who are with him can be
 *  on duty: their face circles his, and his messages come to them too. */
export function StatusPanel({ board, user }: { board: Board; user: User }) {
  const me = board.people.find((p) => p.id === user.person_id);
  const [status, setStatus] = useState<AvailabilityStatus>(me?.status ?? 'available');
  const [minutes, setMinutes] = useState(60);
  const [msg, setMsg] = useState('');
  const choices: AvailabilityStatus[] = user.role === 'caretaker' ? ['on_duty', 'available', 'busy', 'away'] : ['available', 'busy', 'away'];

  const set = async (s: AvailabilityStatus) => {
    setMsg('');
    try {
      await api.put('/api/availability', { status: s, ...(s === 'busy' || s === 'away' ? { until_minutes: minutes } : {}) });
      setStatus(s);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save');
    }
  };

  return (
    <section className="status-panel">
      <div className="stat">
        {choices.map((s) => (
          <button key={s} className={status === s ? 'sel' : ''} data-testid={`status-${s}`} onClick={() => set(s)}>
            {LABEL[s]}
            {s === 'on_duty' && <small>with Jonatito</small>}
          </button>
        ))}
      </div>
      {msg && <p className="duty-why" data-testid="status-msg">{msg}</p>}
      <label className="for">
        for
        <select data-testid="status-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[15, 30, 45, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
        </select>
      </label>
      <p className="muted" data-testid="status-current">Now: {status === 'on_duty' ? 'on duty' : status}</p>
    </section>
  );
}
