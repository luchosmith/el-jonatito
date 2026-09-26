// Jonatito's messages as picture strips + spoken sentence, with one-tap picture replies.
import { useRef, useState } from 'react';
import { api } from '../api.ts';
import { lookupToken, type Board } from '../common/board.ts';
import { TokenCard } from '../common/Token.tsx';
import { BodySvg } from '../common/BodySvg.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { speak } from '../common/hooks.ts';
import { startRecording, type Recording } from '../common/recorder.ts';
import { ClipList, useMyClips } from './Clips.tsx';
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
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState('');
  const rec = useRef<Recording | null>(null);
  const me = board.people.find((p) => p.is_self);
  const mine = m.replies.filter((r) => r.from_user_id === userId);

  const reply = async (kind: 'yes' | 'wait' | 'no', eta_minutes?: number) => {
    await api.post(`/api/messages/${m.id}/replies`, { kind, ...(eta_minutes ? { eta_minutes } : {}) });
    onChange();
  };

  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    await api.post(`/api/messages/${m.id}/replies`, { kind: 'text', text: t });
    setText('');
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
    setPicking(false);
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
      {m.pain && (
        <div className="pain-view" data-testid="message-pain" data-part={m.pain.part} data-level={m.pain.level}>
          <BodySvg photoUrl={me?.photo_url ?? null} selected={m.pain.part} height={170} />
          <PainFace level={m.pain.level} size={72} />
        </div>
      )}
      <button className="play" data-testid="message-sentence" onClick={() => speak(m.sentence_en)}>▶ “{m.sentence_en}”</button>
      {m.audio_url && <audio controls src={m.audio_url} data-testid="message-audio" preload="none" />}

      <div className="replies">
        <button className="r-yes" data-testid="reply-yes" onClick={() => reply('yes')}>✅ Yes!</button>
        <button className="r-wait" data-testid="reply-wait" onClick={() => reply('wait', 5)}>✋ Wait 5 min</button>
        <button className="r-no" data-testid="reply-no" onClick={() => reply('no')}>❌ Not now</button>
        <button className={`r-voice ${picking ? 'sel' : ''}`} data-testid="reply-voice" onClick={() => setPicking((p) => !p)}>
          🎙️ Voice reply
        </button>
      </div>
      {picking && <VoicePicker messageId={m.id} recording={recording} onRecord={toggleVoice} onSent={() => { setPicking(false); onChange(); }} />}
      <form className="reply-typed" onSubmit={(e) => { e.preventDefault(); void sendText(); }}>
        <input value={text} maxLength={120} placeholder="Type a reply… he hears it" data-testid="reply-text-input" onChange={(e) => setText(e.target.value)} />
        <button className="save" data-testid="reply-text-send" disabled={!text.trim()}>➤</button>
      </form>
      {mine.length > 0 && (
        <p className="muted" data-testid="my-replies">You replied: {mine.map((r) => (r.kind === 'text' ? `“${r.text}”` : r.kind)).join(', ')}</p>
      )}
    </article>
  );
}

/** Voice reply: one of your saved clips with one tap, or a new recording. */
function VoicePicker({ messageId, recording, onRecord, onSent }: { messageId: number; recording: boolean; onRecord: () => void; onSent: () => void }) {
  const { clips, reload } = useMyClips();
  return (
    <div className="voice-picker" data-testid="voice-picker">
      <button className={`r-voice rec-new ${recording ? 'rec' : ''}`} data-testid="reply-voice-record" onClick={onRecord}>
        {recording ? '⏹ Stop and send' : '🔴 Record new'}
      </button>
      {clips && (
        <ClipList
          clips={clips}
          sendLabel="Send"
          editable={false}
          onChanged={reload}
          onSend={async (n) => {
            await api.post(`/api/messages/${messageId}/replies/clip`, { note_id: n.id });
            onSent();
          }}
        />
      )}
    </div>
  );
}
