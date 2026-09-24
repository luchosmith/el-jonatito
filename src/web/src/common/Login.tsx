import { useState, type FormEvent } from 'react';
import { api, ApiError, type LoginResult } from '../api.ts';

/** Sign-in for family phones, and one-time setup of Jonatito's tablet. */
export function Login({ onLogin }: { onLogin: (r: LoginResult) => void }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.post<LoginResult>('/api/auth/login', { username, pin }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <svg width="72" height="72" viewBox="0 0 100 100" aria-hidden>
          <rect width="100" height="100" rx="22" fill="#27313d" />
          <circle cx="50" cy="50" r="32" fill="#fff" stroke="#f7d64a" strokeWidth="6" />
          <line x1="50" y1="50" x2="50" y2="30" stroke="#1f2a37" strokeWidth="6" strokeLinecap="round" />
          <line x1="50" y1="50" x2="64" y2="56" stroke="#5aa4e6" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <h1>El Jonatito</h1>
        <label>
          Name
          <input data-testid="login-username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          PIN
          <input data-testid="login-pin" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert" data-testid="login-error">{error}</p>}
        <button data-testid="login-submit" disabled={busy}>Sign in</button>
      </form>
    </div>
  );
}
