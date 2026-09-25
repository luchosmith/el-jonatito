// A family member answered: their face + a picture answer (and a clock for "wait"/"coming").
import { useEffect, useState } from 'react';
import { speak } from '../common/hooks.ts';
import { Clock12 } from '../common/Clock12.tsx';
import { Face, SoundWave } from '../common/Face.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { Lang, Person, Reply } from '../../../shared/types.ts';

const ICON: Record<string, string> = { yes: '✅', no: '❌', wait: '✋', coming: '🚶', text: '💬' };

export function ReplyToast({ reply, person, now, lang, onClose }: { reply: Reply; person: Person | undefined; now: Date; lang: Lang; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  // A typed reply is read aloud as it arrives.
  useEffect(() => {
    if (reply.kind === 'text' && reply.text) speak(reply.text, lang);
  }, [reply.id]);
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
      {reply.kind === 'text' ? (
        <button className="reply-text" data-testid="reply-text" onClick={() => speak(reply.text ?? '', lang)}>“{reply.text}”</button>
      ) : reply.kind === 'voice' ? (
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
