// A picture on his timeline, opened big: a photo from his day, who he talked to, a voice he can hear again.
import { Clock12 } from '../common/Clock12.tsx';
import { Face, SoundWave } from '../common/Face.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { TokenCard } from '../common/Token.tsx';
import { playClip } from '../common/sound.ts';
import type { Board } from '../common/board.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { Lang, TimelineEntry } from '../../../shared/types.ts';

export function EntryCard({ entry, board, lang, onClose }: { entry: TimelineEntry; board: Board; lang: Lang; onClose: () => void }) {
  const at = new Date(entry.at);
  const person = (id: string | null | undefined) => (id ? board.people.find((p) => p.id === id) : undefined);
  let body: React.ReactNode = null;
  if (entry.kind === 'moment') {
    const m = entry.moment;
    body = (
      <>
        <div className="card-strip">
          {m.chips.filter((c) => c.action === 'add').map((c, i) => (
            <TokenCard key={i} t={{ kind: (c.kind === 'body' ? 'thing' : c.kind) ?? 'thing', id: c.id ?? '', label: c.label, emoji: c.emoji, photo_url: c.photo_url }} />
          ))}
        </div>
        <div className="row ok">
          {m.sent_to.map((id) => person(id) && <span key={id} className="big"><Face person={person(id)!} /></span>)}
          <b>“{lang === 'es' ? m.sentence_es ?? m.sentence_en : m.sentence_en}”</b>
          <span className="push big-emoji">📬✔</span>
        </div>
      </>
    );
  } else if (entry.kind === 'voice') {
    const who = person(entry.person_id);
    body = (
      <button className="row ok entry-voice" data-testid="entry-voice" onClick={() => playClip(entry.audio_url)}>
        {who && <span className="big"><Face person={who} /></span>}
        <SoundWave width={90} />
      </button>
    );
  } else if (entry.kind === 'media') {
    body = <div className="row">{entry.cover_url ? <img className="entry-photo" src={entry.cover_url} alt="" /> : <span className="big-emoji">{entry.emoji}</span>}<b>{entry.title}</b></div>;
  } else if (entry.kind === 'pain') {
    const part = board.items.find((i) => i.id === `body_${entry.part}`);
    body = <div className="row"><PainFace level={entry.level} size={84} /><b>● {part?.labels[lang] ?? entry.part}</b></div>;
  } else if (entry.kind === 'log') {
    body = (
      <div className="row">
        {entry.photo_url ? <img className="entry-photo" src={entry.photo_url} alt="" /> : <span className="big-emoji">{entry.emoji ?? '🍽️'}</span>}
        <b>{entry.label}</b><span className="muted">📝 {entry.by}</span>
      </div>
    );
  } else if (entry.kind === 'reply') {
    const who = person(entry.person_id);
    const mark = { yes: '✅', wait: '⏳', no: '❌', coming: '🏃', text: '💬' }[entry.reply];
    body = (
      <div className="row ok">
        {who && <span className="big"><Face person={who} /></span>}
        <span className="big-emoji">{mark}</span>
        {entry.text && <b>“{entry.text}”</b>}
      </div>
    );
  } else if (entry.kind === 'photo' || entry.kind === 'event') {
    const e = entry.event;
    body = (
      <>
        {e.photo_url ? <img className="entry-photo" src={e.photo_url} alt="" data-testid="entry-photo" /> : <div className="big-emoji" style={{ fontSize: 80 }}>{e.emoji ?? '📅'}</div>}
        <div className="row">
          {e.person_ids.map((id) => person(id) && <span key={id} className="big"><Face person={person(id)!} /></span>)}
          <b>{e.title}</b>
        </div>
      </>
    );
  }
  return (
    <div className="overlay" data-testid="entry-card" data-kind={entry.kind} onClick={onClose}>
      <div className="card" onClick={(ev) => ev.stopPropagation()}>
        <h2><Clock12 at={at} size={48} /> {fmt12(at)} <small className="muted">{at.toLocaleDateString('en-US', { weekday: 'long' })}</small></h2>
        {body}
        <button className="cbtn ok" data-testid="entry-ok" onClick={onClose}>👍</button>
      </div>
    </div>
  );
}
