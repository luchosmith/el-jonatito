// In-app notifications (batched on the server) and the 🔔 settings. Push notifications to locked
// phones come later and will use the same queue and settings.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { NotifyBatch, NotifyPrefs } from '../../../shared/types.ts';

/** A soft two-note chime (a real alarm for urgent). Never throws: sound may be blocked. */
function chime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const notes = urgent ? [880, 660, 880, 660] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(urgent ? 0.25 : 0.12, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound */
  }
}

export function NotifyBanner({ batch, onOpen, onClose }: { batch: NotifyBatch; onOpen: () => void; onClose: () => void }) {
  const urgent = batch.lines.some((l) => l.kind === 'urgent' || l.kind === 'panic');
  useEffect(() => {
    chime(urgent);
    if (urgent) return; // urgent stays until opened
    const t = setTimeout(onClose, 10_000);
    return () => clearTimeout(t);
  }, [batch.id]);
  const first = batch.lines[0];
  const more = batch.total - first.count;
  return (
    <div className={`notify-banner ${urgent ? 'urgent' : ''}`} data-testid="notify-banner" data-total={batch.total} data-lines={batch.lines.length}
      role="alert" onClick={onOpen}>
      <b>{urgent ? '🆘 Jonatito' : batch.total > 1 ? `📬 Jonatito · ${batch.total} new` : '📬 Jonatito'}</b>
      <ul>
        {batch.lines.slice(0, 4).map((l, i) => (
          <li key={i} data-testid="notify-line" data-kind={l.kind}>
            {l.kind === 'face' ? '' : '“'}{l.summary.replace(/^💭 /, '💭 ')}{l.kind === 'face' ? '' : '”'}
            {l.count > 1 && <b className="times"> ×{l.count}</b>}
          </li>
        ))}
      </ul>
      {more > 0 && batch.lines.length > 4 && <small>and {batch.lines.length - 4} more</small>}
      <button className="link" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">✖</button>
    </div>
  );
}

const WINDOWS: [number, string][] = [[0, 'Off'], [5, '5 min'], [10, '10 min'], [30, '30 min']];

export function NotifyPrefsPanel() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  useEffect(() => void api.get<NotifyPrefs>('/api/notify-prefs').then(setPrefs), []);
  const save = async (p: Partial<NotifyPrefs>) => {
    setPrefs((cur) => (cur ? { ...cur, ...p } : cur)); // show the change at once
    setPrefs(await api.put<NotifyPrefs>('/api/notify-prefs', p));
  };
  if (!prefs) return null;
  return (
    <section className="notify-prefs" data-testid="notify-prefs">
      <h3>🔔 Notifications</h3>
      <div className="setrow">
        <div>📬 Group his messages<small>the first one right away, the rest together in one update</small></div>
        <div className="seg">
          {WINDOWS.map(([v, l]) => (
            <button key={v} className={prefs.batch_min === v ? 'on' : ''} data-testid={`batch-${v}`} onClick={() => save({ batch_min: v })}>{l}</button>
          ))}
        </div>
      </div>
      <label className="setrow">
        <div>💭 When he taps my face<small>only inside the next update, never on its own</small></div>
        <input type="checkbox" data-testid="face-taps" checked={prefs.face_taps} onChange={(e) => save({ face_taps: e.target.checked })} />
      </label>
      <div className="setrow"><div>🌙 Quiet hours<small>9:00 pm – 7:00 am · one morning update</small></div><b>✔</b></div>
      <div className="setrow"><div>🆘 Urgent<small>always, right away, never grouped</small></div><b>✔</b></div>
      <p className="muted small">For now notifications show while the app is open. Notifications on a locked phone come later.</p>
    </section>
  );
}
