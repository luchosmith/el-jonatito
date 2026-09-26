// Your saved voice clips ("I'll be right there"): label them once, send them again with one tap.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { playClip } from '../common/sound.ts';
import { fmt12ampm } from '../../../shared/time.ts';
import type { VoiceNote } from '../../../shared/types.ts';

export const clipName = (n: VoiceNote) =>
  n.label ?? `Recording · ${new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${fmt12ampm(new Date(n.created_at))}${n.duration_s ? ` · ${Math.round(n.duration_s)} s` : ''}`;

export function useMyClips(version = 0) {
  const [clips, setClips] = useState<VoiceNote[] | null>(null);
  const load = () => api.get<VoiceNote[]>('/api/voice-notes/mine').then(setClips).catch(() => setClips([]));
  useEffect(() => void load(), [version]);
  return { clips, reload: load };
}

/** One row per clip: play it, rename it, and send it (`sendLabel` / `onSend`). */
export function ClipList({ clips, sendLabel, onSend, onChanged, editable = true }: {
  clips: VoiceNote[];
  sendLabel: string;
  onSend: (n: VoiceNote) => Promise<void>;
  onChanged: () => void;
  editable?: boolean;
}) {
  // Rows are keyed by the sound: resending creates a new copy, the clip stays the same row.
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');

  const saveLabel = async (n: VoiceNote) => {
    await api.patch(`/api/voice-notes/${n.id}`, { label: text.trim() || null });
    setEditing(null);
    onChanged();
  };
  const send = async (n: VoiceNote) => {
    setError('');
    setBusy(n.audio_url);
    try {
      await onSend(n);
      setDone(n.audio_url);
      setTimeout(() => setDone((d) => (d === n.audio_url ? null : d)), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send');
    } finally {
      setBusy(null);
    }
  };

  if (!clips.length) return <p className="muted" data-testid="clips-empty">No saved clips yet. Record one with 🎙️.</p>;
  return (
    <ul className="clips" data-testid="clips">
      {clips.map((n) => (
        <li key={n.audio_url} className={`clip ${n.label ? 'named' : ''}`} data-testid="clip" data-id={n.id} data-label={n.label ?? ''}>
          <button className="btn clip-play" aria-label="Listen" onClick={() => playClip(n.audio_url)}>▶</button>
          {editing === n.audio_url ? (
            <form className="clip-edit" onSubmit={(e) => { e.preventDefault(); void saveLabel(n); }}>
              <input autoFocus value={text} maxLength={60} placeholder="e.g. I'll be right there" data-testid="clip-label-input" onChange={(e) => setText(e.target.value)} />
              <button className="btn" data-testid="clip-label-save">Save</button>
            </form>
          ) : (
            <span className="clip-name">
              {n.label ? <b>“{n.label}”</b> : <span className="muted">{clipName(n)}</span>}
              {editable && (
                <button className="link" data-testid="clip-label" onClick={() => { setEditing(n.audio_url); setText(n.label ?? ''); }}>✏️</button>
              )}
            </span>
          )}
          <button className="save clip-send" data-testid="clip-send" disabled={busy === n.audio_url} onClick={() => send(n)}>
            {done === n.audio_url ? '✔ Sent' : busy === n.audio_url ? '…' : sendLabel}
          </button>
        </li>
      ))}
      {error && <li className="error">{error}</li>}
    </ul>
  );
}
