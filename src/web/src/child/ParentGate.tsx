// PIN pad shown after a 3-second hold on the hidden top-right corner.
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { User } from '../../../shared/types.ts';

export function ParentGate({ onOpen, onCancel }: { onOpen: (token: string, user: User) => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  const submit = async () => {
    try {
      const r = await api.post<{ token: string; user: User }>('/api/auth/elevate', { pin });
      onOpen(r.token, r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error');
      setPin('');
    }
  };

  return (
    <div className="overlay" data-testid="parent-gate">
      <div className="card pinpad">
        <h2>🔒</h2>
        <div className="pin-dots" data-testid="pin-dots">{'●'.repeat(pin.length) || '·'}</div>
        {error && <p className="error" data-testid="gate-error">{error}</p>}
        <div className="keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✔'].map((k) => (
            <button
              key={k}
              data-testid={`key-${k}`}
              onClick={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : k === '✔' ? submit() : press(k))}
            >
              {k}
            </button>
          ))}
        </div>
        <button className="cbtn" data-testid="gate-cancel" onClick={onCancel}>✖</button>
      </div>
    </div>
  );
}
