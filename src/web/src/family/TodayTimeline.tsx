// Caretakers: 🕒 Today. Every moment on the tablet, sent or not ("He may have meant…"), with his day
// around it (pain, voices he played, media, the caretakers' own log). Unsent moments can be answered.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Board } from '../common/board.ts';
import { Face } from '../common/Face.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { fmt12ampm } from '../../../shared/time.ts';
import type { Moment, MomentChip, TimelineEntry } from '../../../shared/types.ts';

type Filter = 'all' | 'not_sent' | 'urgent';
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function TodayTimeline({ board, version }: { board: Board; version: number }) {
  const [day, setDay] = useState(() => new Date());
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const load = () => api.get<TimelineEntry[]>(`/api/moments?day=${isoDay(day)}`).then(setEntries);
  useEffect(() => void load(), [version, day.toDateString()]);

  const person = (id: string | null | undefined) => (id ? board.people.find((p) => p.id === id) : undefined);
  const name = (id: string) => person(id)?.short_label ?? id;
  const urgentIds = new Set(entries.filter((e) => e.kind === 'pain' && e.level >= 3).map((e) => e.at));
  const shown = entries.filter((e) => {
    if (filter === 'not_sent') return e.kind === 'moment' && e.moment.outcome === 'not_sent';
    if (filter === 'urgent') return e.kind === 'pain' ? e.level >= 3 : false;
    return true;
  });
  const notSent = entries.filter((e) => e.kind === 'moment' && e.moment.outcome === 'not_sent').length;
  const answer = async (m: Moment, kind: 'yes' | 'wait' | 'no') => {
    await api.post(`/api/moments/${m.id}/answer`, { kind, ...(kind === 'wait' ? { eta_minutes: 5 } : {}) });
    await load();
  };
  const shift = (days: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));

  return (
    <section className="today" data-testid="today-timeline">
      <div className="today-top">
        <div className="fam-tabs small">
          <button className={filter === 'all' ? 'on' : ''} data-testid="today-all" onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'not_sent' ? 'on' : ''} data-testid="today-not-sent" onClick={() => setFilter('not_sent')}>Not sent · {notSent}</button>
          <button className={filter === 'urgent' ? 'on' : ''} data-testid="today-urgent" onClick={() => setFilter('urgent')}>Urgent · {urgentIds.size}</button>
        </div>
        <div className="today-day">
          <button className="btn" data-testid="today-prev" onClick={() => shift(-1)}>◀</button>
          <b data-testid="today-date">{isoDay(day) === isoDay(new Date()) ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b>
          <button className="btn" onClick={() => shift(1)} disabled={isoDay(day) === isoDay(new Date())}>▶</button>
        </div>
      </div>
      {shown.length === 0 && <p className="muted" data-testid="today-empty">Nothing here yet.</p>}
      {shown.map((e, i) => {
        const time = <time>{fmt12ampm(new Date(e.at))}</time>;
        if (e.kind === 'moment') {
          const m = e.moment;
          const head =
            m.outcome === 'sent' ? <>📬 Sent to {m.sent_to.map(name).join(', ') || 'the caretaker on duty'}</>
            : m.outcome === 'cleared' ? <>✖ Cleared</>
            : m.outcome === 'open' ? <>… He is tapping</>
            : m.notified.length ? <>💭 Not sent · {m.notified.map(name).join(', ')} will get it in their next update</>
            : <>📝 Not sent</>;
          const closed = m.chips.filter((c, k) => c.closed_until && m.chips.findIndex((x) => x.id === c.id && x.closed_until) === k); // once per item
          return (
            <article key={`m${m.id}`} className={`mom ${m.outcome}`} data-testid="today-moment" data-outcome={m.outcome} data-id={m.id}>
              <div className="top">{head}{time}</div>
              <div className="chips2">{m.chips.map((c, k) => <Chip key={k} c={c} person={person(c.id)} />)}</div>
              {m.sentence_en && m.outcome !== 'sent' && <p className="meant" data-testid="today-meant">He may have meant: “{m.sentence_en}”</p>}
              {m.sentence_en && m.outcome === 'sent' && <p>“{m.sentence_en}”</p>}
              {closed.map((c, k) => (
                <p key={k} className="ctx">{c.emoji} {c.label} was closed; it opens {fmt12ampm(new Date(c.closed_until!))}{m.chips.filter((x) => x.id === c.id).length > 1 ? ' · he tried more than once' : ''}</p>
              ))}
              {m.answered_by ? (
                <p className="muted small" data-testid="today-answered">Answered by {m.answered_by}</p>
              ) : m.outcome === 'not_sent' && (m.sentence_en || m.chips.length > 0) ? (
                <div className="ans">
                  <button className="r-yes" data-testid="today-answer-yes" onClick={() => answer(m, 'yes')}>✅ Yes</button>
                  <button className="r-wait" data-testid="today-answer-wait" onClick={() => answer(m, 'wait')}>✋ Wait</button>
                  <button className="r-no" data-testid="today-answer-no" onClick={() => answer(m, 'no')}>❌ Not now</button>
                </div>
              ) : null}
            </article>
          );
        }
        if (e.kind === 'pain') {
          const part = board.items.find((it) => it.id === `body_${e.part}`)?.labels.en ?? e.part;
          return <article key={i} className={`mom ${e.level >= 3 ? 'urgent' : 'misc'}`} data-testid="today-pain"><div className="top"><PainFace level={e.level} size={26} /> {part} · {e.level} of 5{time}</div></article>;
        }
        if (e.kind === 'voice') {
          return <article key={i} className="mom misc"><div className="top">〰️ Played {person(e.person_id)?.short_label ?? 'a'}’s voice note{time}</div></article>;
        }
        if (e.kind === 'media') return <article key={i} className="mom misc"><div className="top">{e.emoji ?? '🎬'} {e.title}{time}</div></article>;
        if (e.kind === 'log') return <article key={i} className="mom misc"><div className="top">📝 {e.by} logged {e.emoji ?? ''} {e.label}{e.amount != null && e.amount < 1 ? ` ${e.amount * 100}%` : ''}{time}</div></article>;
        if (e.kind === 'photo' || e.kind === 'event') {
          return (
            <article key={i} className="mom misc" data-testid="today-event">
              <div className="top">{e.kind === 'photo' ? '📷' : '📅'} {e.event.title}{time}</div>
              {e.event.photo_url && <img className="today-photo" src={e.event.photo_url} alt="" />}
            </article>
          );
        }
        return null;
      })}
    </section>
  );
}

function Chip({ c, person }: { c: MomentChip; person: ReturnType<Board['people']['find']> }) {
  const cls = c.kind === 'person' || c.kind === 'pet' ? 'p' : c.kind === 'action' ? 'a' : '';
  return (
    <span className={`tchip ${cls} ${c.closed_until ? 'dim' : ''}`} title={`${c.action}: ${c.label}`} data-action={c.action}>
      {person ? <Face person={person} /> : c.photo_url ? <img src={c.photo_url} alt="" /> : c.emoji ?? '•'}
    </span>
  );
}
