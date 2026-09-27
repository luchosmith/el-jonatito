// Caretakers: 📅 Calendar. Events show on the future side of his timeline (with a picture and the
// faces of who is involved); photos put at a past time show on the past side.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import { Face } from '../common/Face.tsx';
import { fmt12ampm } from '../../../shared/time.ts';
import type { CalendarEvent } from '../../../shared/types.ts';

const SHOW_FROM: [number, string][] = [[0, 'at that time'], [180, '3 hours before'], [1440, 'the day before'], [10080, 'a week before']];
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function CalendarAdmin({ board, version }: { board: Board; version: number }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [kind, setKind] = useState<'event' | 'photo'>('event');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => localDate(new Date()));
  const [time, setTime] = useState('10:00');
  const [emoji, setEmoji] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [showFrom, setShowFrom] = useState(1440);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => api.get<CalendarEvent[]>('/api/calendar').then(setEvents);
  useEffect(() => void load(), [version]);

  const add = async () => {
    setMsg('');
    if (!title.trim()) return setMsg('Give it a short title.');
    if (kind === 'photo' && !file) return setMsg('Choose a photo.');
    try {
      const ev = await api.post<CalendarEvent>('/api/calendar', {
        title: title.trim(), starts_at: new Date(`${date}T${time}:00`).toISOString(), kind, person_ids: people,
        show_from_min: showFrom, ...(emoji ? { emoji } : {}),
      });
      if (file) await api.upload('PUT', `/api/calendar/${ev.id}/image`, file);
      setTitle(''); setEmoji(''); setPeople([]); setFile(null);
      setMsg(kind === 'photo' ? 'Photo added to his day.' : 'Added to his timeline.');
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  const remove = async (id: number) => {
    await api.del(`/api/calendar/${id}`);
    await load();
  };
  const person = (id: string) => board.people.find((p) => p.id === id);
  const choosable = board.people.filter((p) => p.kind === 'person' && !p.is_self);

  return (
    <section className="calendar-admin" data-testid="calendar-admin">
      <div className="fam-tabs small">
        <button className={kind === 'event' ? 'on' : ''} data-testid="cal-kind-event" onClick={() => setKind('event')}>📅 Event (coming up)</button>
        <button className={kind === 'photo' ? 'on' : ''} data-testid="cal-kind-photo" onClick={() => setKind('photo')}>📷 Photo on his day</button>
      </div>
      <div className="cal-form panel">
        <input data-testid="cal-title" value={title} placeholder={kind === 'photo' ? 'What is in the photo? (the park)' : 'What is it? (Dentist)'} onChange={(e) => setTitle(e.target.value)} />
        <div className="two">
          <input type="date" data-testid="cal-date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" data-testid="cal-time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="two">
          <input data-testid="cal-emoji" value={emoji} placeholder="Emoji (🦷)" onChange={(e) => setEmoji(e.target.value)} />
          <label className="btn">
            {file ? `📷 ${file.name}` : '📷 Photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-testid="cal-photo" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="cal-people">
          Who:
          {choosable.map((p) => (
            <button key={p.id} className={`cal-person ${people.includes(p.id) ? 'sel' : ''}`} data-testid={`cal-person-${p.id}`}
              onClick={() => setPeople((ps) => (ps.includes(p.id) ? ps.filter((x) => x !== p.id) : [...ps, p.id]))}>
              <Face person={p} />
            </button>
          ))}
        </div>
        {kind === 'event' && (
          <label>
            Show on his timeline
            <select data-testid="cal-show-from" value={showFrom} onChange={(e) => setShowFrom(Number(e.target.value))}>
              {SHOW_FROM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <button className="save" data-testid="cal-add" onClick={add}>{kind === 'photo' ? 'Add to his day' : 'Add to his timeline'}</button>
        {msg && <p className="muted" data-testid="cal-msg">{msg}</p>}
      </div>

      <h3>On his timeline</h3>
      {events.length === 0 && <p className="muted">Nothing yet.</p>}
      {events.map((e) => (
        <div key={e.id} className="cal-ev" data-testid="cal-event" data-kind={e.kind}>
          {e.photo_url ? <img src={e.photo_url} alt="" /> : <span className="big-emoji">{e.emoji ?? '📅'}</span>}
          <div>
            <b>{e.kind === 'photo' ? '📷 ' : ''}{e.title}</b>
            <span className="muted small">{fmt12ampm(new Date(e.starts_at))} · {new Date(e.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="cal-faces">{e.person_ids.map((id) => person(id) && <span key={id} className="mini"><Face person={person(id)!} /></span>)}</span>
          </div>
          <button className="link" data-testid={`cal-delete-${e.id}`} onClick={() => remove(e.id)} aria-label="Delete">✖</button>
        </div>
      ))}
    </section>
  );
}
