// Caretakers: 📅 Calendar. Events show on the future side of his timeline (with a picture and the
// faces of who is involved); photos put at a past time show on the past side.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import { Face } from '../common/Face.tsx';
import { fmt12ampm } from '../../../shared/time.ts';
import type { CalendarEvent, EventTemplate } from '../../../shared/types.ts';

const SHOW_FROM: [number, string][] = [[0, 'at that time'], [180, '3 hours before'], [1440, 'the day before'], [10080, 'a week before'], [525600, 'right away']];
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
  const [showFrom, setShowFrom] = useState(525600);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [template, setTemplate] = useState<string | null>(null);
  const load = () => api.get<CalendarEvent[]>('/api/calendar').then(setEvents);
  useEffect(() => void load(), [version]);
  useEffect(() => void api.get<EventTemplate[]>('/api/calendar/templates').then(setTemplates).catch(() => undefined), [version]);
  const tpl = templates.find((t) => t.id === template);

  const add = async () => {
    setMsg('');
    if (!title.trim() && !(kind === 'event' && template)) return setMsg('Give it a short title, or pick what it is.');
    if (kind === 'photo' && !file) return setMsg('Choose a photo.');
    try {
      const ev = await api.post<CalendarEvent>('/api/calendar', {
        ...(title.trim() ? { title: title.trim() } : {}), starts_at: new Date(`${date}T${time}:00`).toISOString(), kind, person_ids: people,
        show_from_min: showFrom, ...(emoji ? { emoji } : {}), ...(kind === 'event' && template ? { template } : {}),
      });
      if (file) await api.upload('PUT', `/api/calendar/${ev.id}/image`, file);
      setTitle(''); setEmoji(''); setPeople([]); setFile(null); setTemplate(null);
      setMsg(kind === 'photo' ? 'Photo added to his day.' : 'Added to his timeline.');
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  const setDefault = async (id: string, f: File | null) => {
    setTemplates(await (f ? api.upload<EventTemplate[]>('PUT', `/api/calendar/templates/${id}/image`, f) : api.del<EventTemplate[]>(`/api/calendar/templates/${id}/image`)));
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
        {kind === 'event' && (
          <div className="plan-picks" data-testid="cal-templates">
            {templates.map((t) => (
              <button key={t.id} className={`plan-pick ${template === t.id ? 'sel' : ''}`} data-testid={`cal-tpl-${t.id}`} onClick={() => setTemplate(template === t.id ? null : t.id)}>
                <b>{t.photo_url ? <img src={t.photo_url} alt="" /> : t.emoji}</b><span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
        {tpl && <p className="muted small">Picture: {tpl.photo_url ? 'the family photo for' : tpl.emoji} {tpl.label.toLowerCase()} · or 📷 use your own photo for this one</p>}
        <input data-testid="cal-title" value={title} placeholder={kind === 'photo' ? 'What is in the photo? (the park)' : tpl ? `${tpl.label} (or type a title)` : 'What is it? (Dentist)'} onChange={(e) => setTitle(e.target.value)} />
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

      {kind === 'event' && (
        <details className="panel cal-defaults" data-testid="cal-defaults">
          <summary>Default pictures for each kind</summary>
          {templates.map((t) => (
            <div key={t.id} className="cal-ev">
              {t.photo_url ? <img src={t.photo_url} alt="" /> : <span className="big-emoji">{t.emoji}</span>}
              <div><b>{t.label}</b></div>
              <label className="btn small">📷
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid={`tpl-photo-${t.id}`}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void setDefault(t.id, f); e.target.value = ''; }} />
              </label>
              {t.photo_url && <button className="link" data-testid={`tpl-revert-${t.id}`} onClick={() => void setDefault(t.id, null)}>↺ {t.emoji}</button>}
            </div>
          ))}
        </details>
      )}

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
