// A round 🎙️ button on every screen of the family app (Android or iPhone): tap to record a message
// for Jonatito, tap again to stop, listen back, send. On his tablet it pops up with your face and
// plays once; it then stays on your page for him to replay.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { startRecording, type Recording } from '../common/recorder.ts';

const MAX_MS = 60_000;

export function RecordButton({ onSent }: { onSent?: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'sending' | 'sent'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [error, setError] = useState('');
  const rec = useRef<Recording | null>(null);
  const started = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
  }, []);

  const stop = async () => {
    if (!rec.current) return;
    if (tick.current) clearInterval(tick.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    const blob = await rec.current.stop();
    rec.current = null;
    setPreview({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - started.current) / 1000 });
    setState('preview');
  };

  const start = async () => {
    setError('');
    try {
      rec.current = await startRecording(MAX_MS + 500);
    } catch {
      setError('The microphone is not available. Allow it for this site in the phone’s settings.');
      return;
    }
    started.current = Date.now();
    setSeconds(0);
    setState('recording');
    tick.current = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    stopTimer.current = setTimeout(() => void stop(), MAX_MS);
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
      await api.upload('POST', `/api/voice-notes?duration=${preview.seconds.toFixed(1)}`, preview.blob);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      setState('sent');
      onSent?.();
      setTimeout(() => setState((s) => (s === 'sent' ? 'idle' : s)), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.');
      setState('preview');
    }
  };

  return (
    <>
      {(state === 'preview' || state === 'sending' || error) && (
        <div className="rec-sheet" data-testid="rec-sheet">
          {preview && (
            <>
              <b>🎙️ For Jonatito · {Math.max(1, Math.round(preview.seconds))} s</b>
              <audio controls src={preview.url} data-testid="rec-preview" />
              <div className="btnrow">
                <button className="save" data-testid="rec-send" onClick={send} disabled={state === 'sending'}>
                  {state === 'sending' ? 'Sending…' : 'Send to Jonatito'}
                </button>
                <button className="btn" data-testid="rec-discard" onClick={discard} disabled={state === 'sending'}>Discard</button>
              </div>
            </>
          )}
          {error && <p className="error" data-testid="rec-error">{error}</p>}
          {!preview && <button className="btn" onClick={() => setError('')}>OK</button>}
        </div>
      )}
      <button
        className={`rec-fab ${state}`}
        data-testid="rec-fab"
        data-state={state}
        onClick={() => (state === 'recording' ? void stop() : state === 'idle' || state === 'sent' ? void start() : undefined)}
        aria-label={state === 'recording' ? 'Stop recording' : 'Record a message for Jonatito'}
      >
        {state === 'recording' ? <><span className="rec-dot" />{seconds}s</> : state === 'sent' ? '✔' : '🎙️'}
      </button>
    </>
  );
}
