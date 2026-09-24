import { useState } from 'react';
import { deviceLang } from '../common/hooks.ts';

/** Per-tablet settings (stored on this device only). */
export function SettingsPanel() {
  const [lang, setLang] = useState(deviceLang());
  const choose = (l: 'en' | 'es') => {
    try {
      localStorage.setItem('jt.lang', l);
    } catch {
      /* ignore */
    }
    setLang(l);
  };
  return (
    <section className="settings" data-testid="tablet-settings">
      <h3>Voice language</h3>
      <div className="stat">
        <button className={lang === 'en' ? 'sel' : ''} data-testid="lang-en" onClick={() => choose('en')}>English</button>
        <button className={lang === 'es' ? 'sel' : ''} data-testid="lang-es" onClick={() => choose('es')}>Español</button>
      </div>
    </section>
  );
}
