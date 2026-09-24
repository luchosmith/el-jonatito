// A family member answered: their face + a picture answer (and a clock for "wait"/"coming").
import { useState } from 'react';
import { Clock12 } from '../common/Clock12.tsx';
import { Face, SoundWave } from '../common/Face.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { Person, Reply } from '../../../shared/types.ts';

const ICON: Record<string, string> = { yes: '✅', no: '❌', wait: '✋', coming: '🚶' };

export function ReplyToast({ reply, person, now, onClose }: { reply: Reply; person: Person | undefined; now: Date; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const play = () => {
    if (!reply.audio_url) return;
    const a = new Audio(reply.audio_url);
    setPlaying(true);
    a.onended = () => setPlaying(false);
    a.play().catch(() => setPlaying(false));
  };
  const eta = reply.eta_at ? new Date(reply.eta_at) : null;

  return (
    <div className="toast" data-testid="reply-toast" data-kind={reply.kind}>
      {person && <span className="big"><Face person={person} /></span>}
      {reply.kind === 'voice' ? (
        <button className="listen-btn" data-testid="reply-listen" onClick={play}>
          <SoundWave playing={playing} />
        </button>
      ) : (
        <span className="big-emoji" data-testid={`reply-kind-${reply.kind}`}>{ICON[reply.kind]}</span>
      )}
      {eta && (
        <>
          <Clock12 at={eta} from={now} size={56} />
          <b className="time">{fmt12(eta)}</b>
        </>
      )}
      <button className="toast-close" data-testid="reply-close" onClick={onClose}>👍</button>
    </div>
  );
}
