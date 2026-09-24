import { useEffect, useState } from 'react';
import { api, ApiError, setSessionToken, type LoginResult } from './api.ts';
import type { User } from '../../shared/types.ts';
import { Login } from './common/Login.tsx';
import { ChildApp } from './child/ChildApp.tsx';
import { FamilyApp } from './family/FamilyApp.tsx';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<{ user: User }>('/api/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError)) console.error(e);
        setUser(null);
      });
  }, []);

  const onLogin = (r: LoginResult) => {
    setSessionToken(r.token);
    setUser(r.user);
  };

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setSessionToken(null);
    setUser(null);
  };

  if (user === undefined) return <div className="splash" />;
  if (!user) return <Login onLogin={onLogin} />;
  if (user.role === 'child') return <ChildApp user={user} />;
  return <FamilyApp user={user} onLogout={logout} />;
}
