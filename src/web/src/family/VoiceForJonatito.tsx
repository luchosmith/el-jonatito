// Record a voice note for Jonatito. It appears as a sound wave in front of your face on his tablet,
// and stays on his voice shelf so he can hear a familiar voice whenever he wants.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { fmt12ampm } from '../../../shared/time.ts';
import { ClipList, clipName, useMyClips } from './Clips.tsx';
import type { User, VoiceNote } from '../../../shared/types.ts';

const MAX_MS = 60_000;

export function VoiceForJonatito({ user, version }: { user: User; version: number }) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'sending'>('idle');
  const [preview, setPreview] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [mine, setMine] = useState<VoiceNote[]>([]);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const clips = useMyClips(version);
  const rec = useRef<Recording | null>(null);
  const started = useRef(0);

  const load = () => api.get<VoiceNote[]>('/api/voice-notes').then((all) => setMine(all.filter((n) => n.from_user_id === user.id)));
  useEffect(() => void load(), [version]);

  const toggle = async () => {
    setError('');
    if (state === 'recording') {
      const blob = await rec.current!.stop();
      rec.current = null;
      setPreview({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - started.current) / 1000 });
      setState('preview');
      return;
    }
    try {
      rec.current = await startRecording(MAX_MS);
      started.current = Date.now();
      setState('recording');
    } catch {
      setError('The microphone is not available.');
    }
  };

  const discard = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setState('idle');
  };

  const send = async () => {
    if (!preview) return;
    setState('sending');
    try {
      const q = `duration=${preview.seconds.toFixed(1)}${label.trim() ? `&label=${encodeURIComponent(label.trim())}` : ''}`;
      await api.upload('POST', `/api/voice-notes?${q}`, preview.blob);
      setLabel('');
      discard();
      await load();
      await clips.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send');
      setState('preview');
    }
  };

  return (
    <section className="voice-for" data-testid="voice-for-jonatito">
      <p className="muted">Record a message for Jonatito. He sees a sound wave in front of your face and can play it any time.</p>
      <button className={`record-big ${state === 'recording' ? 'rec' : ''}`} data-testid="voice-record" data-state={state} onClick={toggle} disabled={state === 'preview' || state === 'sending'}>
        {state === 'recording' ? '⏹ Stop' : '🎙️ Record for Jonatito'}
      </button>
      {preview && (
        <div className="voice-preview">
          <audio controls src={preview.url} data-testid="voice-preview" />
          <input className="clip-label-new" value={label} maxLength={60} placeholder="Name it to send again later (optional): I'll be right there" data-testid="voice-label" onChange={(e) => setLabel(e.target.value)} />
          <div className="btnrow">
            <button className="save" data-testid="voice-send" onClick={send} disabled={state === 'sending'}>Send to Jonatito</button>
            <button className="btn" data-testid="voice-discard" onClick={discard}>Discard</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <h3>My clips</h3>
      <p className="muted small">Send one again as a new message, without recording. ✏️ to name it.</p>
      {clips.clips && (
        <ClipList
          clips={clips.clips}
          sendLabel="↻ Send again"
          onChanged={() => { void clips.reload(); void load(); }}
          onSend={async (n) => {
            await api.post(`/api/voice-notes/${n.id}/resend`);
            await load();
            await clips.reload();
          }}
        />
      )}

      <h3>Sent</h3>
      {mine.length === 0 && <p className="muted" data-testid="voice-mine-empty">Nothing yet.</p>}
      <ul className="log-list" data-testid="voice-mine">
        {mine.map((n) => (
          <li key={n.id} data-testid="voice-mine-item" data-heard={n.heard_at ? 'yes' : 'no'}>
            <span>{n.pinned ? '⭐ ' : ''}〰️ {n.label ? `“${n.label}”` : clipName(n)}</span>
            <span className="muted">{n.heard_at ? 'heard ✔' : 'not heard yet'}</span>
            <time>{fmt12ampm(new Date(n.created_at))}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
