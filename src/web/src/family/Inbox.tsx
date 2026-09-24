// Jonatito's messages as picture strips + spoken sentence, with one-tap picture replies.
import { useRef, useState } from 'react';
import { api } from '../api.ts';
import { lookupToken, type Board } from '../common/board.ts';
import { TokenCard } from '../common/Token.tsx';
import { speak } from '../common/hooks.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { fmt12ampm } from '../../../shared/time.ts';
import type { Message } from '../../../shared/types.ts';

export function Inbox({ messages, board, userId, onChange }: { messages: Message[]; board: Board; userId: number; onChange: () => void }) {
  if (!messages.length) return <p className="muted" data-testid="inbox-empty">No messages yet.</p>;
  return (
    <div className="inbox" data-testid="inbox">
      {messages.map((m) => <MessageCard key={m.id} m={m} board={board} userId={userId} onChange={onChange} />)}
    </div>
  );
}

function MessageCard({ m, board, userId, onChange }: { m: Message; board: Board; userId: number; onChange: () => void }) {
  const [recording, setRecording] = useState(false);
  const rec = useRef<Recording | null>(null);
  const me = board.people.find((p) => p.is_self);
  const mine = m.replies.filter((r) => r.from_user_id === userId);

  const reply = async (kind: 'yes' | 'wait' | 'no', eta_minutes?: number) => {
    await api.post(`/api/messages/${m.id}/replies`, { kind, ...(eta_minutes ? { eta_minutes } : {}) });
    onChange();
  };

  const toggleVoice = async () => {
    if (!recording) {
      rec.current = await startRecording(30_000);
      setRecording(true);
      return;
    }
    const blob = await rec.current!.stop();
    setRecording(false);
    await api.upload('POST', `/api/messages/${m.id}/replies/voice`, blob);
    onChange();
  };

  return (
    <article className={`msg ${m.priority === 'urgent' ? 'urgent' : ''}`} data-testid="inbox-message" data-id={m.id} data-priority={m.priority}>
      <div className="from">
        {me?.photo_url ? <img src={me.photo_url} alt="" /> : <span>🧑</span>}
        <b>Jonatito</b>
        {m.priority === 'urgent' && <span className="urgent-tag" data-testid="urgent-tag">🆘 URGENT</span>}
        <time>{fmt12ampm(new Date(m.created_at))}</time>
      </div>
      {m.tokens.length > 0 && (
        <div className="mstrip">
          {m.tokens.map((t, i) => {
            const st = lookupToken(board, t);
            return st ? <TokenCard key={i} t={st} /> : null;
          })}
        </div>
      )}
      <button className="play" data-testid="message-sentence" onClick={() => speak(m.sentence_en)}>▶ “{m.sentence_en}”</button>
      {m.audio_url && <audio controls src={m.audio_url} data-testid="message-audio" preload="none" />}

      <div className="replies">
        <button className="r-yes" data-testid="reply-yes" onClick={() => reply('yes')}>✅ Yes!</button>
        <button className="r-wait" data-testid="reply-wait" onClick={() => reply('wait', 5)}>✋ Wait 5 min</button>
        <button className="r-no" data-testid="reply-no" onClick={() => reply('no')}>❌ Not now</button>
        <button className={`r-voice ${recording ? 'rec' : ''}`} data-testid="reply-voice" onClick={toggleVoice}>
          {recording ? '⏹ Send voice' : '🎙️ Voice reply'}
        </button>
      </div>
      {mine.length > 0 && (
        <p className="muted" data-testid="my-replies">You replied: {mine.map((r) => r.kind).join(', ')}</p>
      )}
    </article>
  );
}
