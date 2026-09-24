// A face, big. Touch zones: ear = TALK (record a voice message to them),
// sound wave = LISTEN (their last message or default hello), eyes = come see, hand = help, heart = love.
import { useRef, useState } from 'react';
import { api } from '../api.ts';
import { Clock12 } from '../common/Clock12.tsx';
import { Face, SoundWave } from '../common/Face.tsx';
import { speak } from '../common/hooks.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { Person } from '../../../shared/types.ts';

const RECORD_MS = 4000;

export function PersonView({ person, now, onSocial, onBack }: {
  person: Person;
  now: Date;
  onSocial: (symbolId: string) => void;
  onBack: () => void;
}) {
  const [talk, setTalk] = useState<'idle' | 'recording' | 'sent' | 'error'>('idle');
  const [listening, setListening] = useState(false);
  const rec = useRef<Recording | null>(null);
  const isPet = person.kind === 'pet';

  const onTalk = async () => {
    if (talk === 'recording') return finishTalk();
    try {
      rec.current = await startRecording(RECORD_MS + 1000);
      setTalk('recording');
      setTimeout(() => void finishTalk(), RECORD_MS);
    } catch {
      setTalk('error');
    }
  };

  const finishTalk = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const blob = await r.stop();
    try {
      await api.upload('POST', `/api/messages/voice?to=${encodeURIComponent(person.id)}`, blob);
      setTalk('sent');
    } catch {
      setTalk('error');
    }
  };

  const onListen = async () => {
    setListening(true);
    try {
      const { url } = await api.get<{ url: string | null }>(`/api/people/${encodeURIComponent(person.id)}/voice`);
      if (url) {
        const a = new Audio(url);
        a.onended = () => setListening(false);
        await a.play();
        return;
      }
    } catch {
      /* fall back to the default hello */
    }
    speak(`¡Hola, Jonatito!`, 'es');
    setTimeout(() => setListening(false), 1800);
  };

  const until = person.status_until ? new Date(person.status_until) : null;

  return (
    <div className="person" data-testid={`person-${person.id}`}>
      <button className="back" data-testid="person-back" onClick={onBack} aria-label="Back">⬅</button>
      <div className={`face ${person.status ?? 'available'}`}>
        <Face person={person} className="big-face" />
        {!isPet && (
          <>
            <button className={`hs ear ${talk === 'recording' ? 'rec' : ''}`} data-testid="zone-talk" data-state={talk} onClick={onTalk} style={{ left: -30, top: 170 }}>
              👂<span>TALK</span>
            </button>
            <button className={`hs wave ${listening ? 'speaking' : ''}`} data-testid="zone-listen" onClick={onListen} style={{ left: 175, top: 285 }}>
              <SoundWave playing={listening} />
              <span>LISTEN</span>
            </button>
            <button className="hs" data-testid="zone-come-see" onClick={() => onSocial('come_see')} style={{ left: 175, top: 60 }}>
              👀<span>COME SEE</span>
            </button>
            <button className="hs" data-testid="zone-help" onClick={() => onSocial('help_me')} style={{ right: -40, top: 300 }}>
              ✋<span>HELP</span>
            </button>
            <button className="hs love" data-testid="zone-love" onClick={() => onSocial('love')} style={{ left: 30, top: 340 }}>
              ❤️<span>LOVE</span>
            </button>
          </>
        )}
      </div>
      <div className="pinfo">
        <h2>{person.short_label}</h2>
        {person.status && person.status !== 'available' && (
          <div className="status-row" data-testid="person-status">
            <span className="big-emoji">{person.status === 'busy' ? '🟡' : '⚫'}</span>
            {until && (
              <>
                <Clock12 at={until} from={now} size={120} />
                <b className="time big-time">{fmt12(until)}</b>
              </>
            )}
          </div>
        )}
        <div className="talk-state" data-testid="talk-state">
          {talk === 'recording' && <span className="wave-live">🔴 → 👂</span>}
          {talk === 'sent' && <span data-testid="voice-sent">👂 📬✔</span>}
          {talk === 'error' && <span>🎤✖</span>}
        </div>
      </div>
    </div>
  );
}
