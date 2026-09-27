// Caretakers: 🗓️ His day. Pick what a meal is on a given day (smoothie, pancakes, eggs, cereal…), or
// take a photo that is used for that day only. With no pick, the everyday picture shows.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { Board } from '../common/board.ts';
import { routinePicture } from '../common/routine.ts';
import { fmtMinutes, localDay } from '../../../shared/time.ts';
import type { ScheduleDay, ScheduleItem } from '../../../shared/types.ts';

const DAYS_AHEAD = 7;

export function DayPlan({ board, version }: { board: Board; version: number }) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [offset, setOffset] = useState(1); // tomorrow: the usual "what's for breakfast" question
  const [more, setMore] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => {
    api.get<ScheduleItem[]>('/api/schedule').then(setSchedule).catch(() => undefined);
    api.get<ScheduleDay[]>('/api/schedule/days').then(setDays).catch(() => undefined);
  };
  useEffect(load, [version]);

  const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const date = dates[offset];
  const day = localDay(date);
  const dayName = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
  const foods = board.items.filter((i) => (i.category === 'food' || i.category === 'drink') && !i.alias_of && !i.is_hidden);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg('');
    try {
      await fn();
      setMsg(done);
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  const pick = (s: ScheduleItem, itemId: string) => act(() => api.put(`/api/schedule/${s.id}/days/${day}`, { item_id: itemId }), `${s.label}: saved for ${dayName(date, offset).toLowerCase()}.`);
  const photo = (s: ScheduleItem, file: File) => act(() => api.upload('PUT', `/api/schedule/${s.id}/days/${day}/image`, file), `${s.label}: photo for ${dayName(date, offset).toLowerCase()} only.`);
  const reset = (s: ScheduleItem) => act(() => api.del(`/api/schedule/${s.id}/days/${day}`), `${s.label}: back to the usual.`);

  const Pic = ({ id }: { id: string }) => {
    const it = board.items.find((x) => x.id === id);
    return it?.photo_url ? <img src={it.photo_url} alt="" /> : <>{it?.emoji ?? '🍽️'}</>;
  };

  return (
    <section className="day-plan" data-testid="day-plan">
      <div className="fam-tabs small">
        {dates.map((d, i) => (
          <button key={i} className={offset === i ? 'on' : ''} data-testid={`plan-day-${i}`} onClick={() => setOffset(i)}>{dayName(d, i)}</button>
        ))}
      </div>
      {msg && <p className="muted" data-testid="plan-msg">{msg}</p>}
      {schedule.map((s) => {
        const pic = routinePicture(s, day, days, board);
        const current = days.find((d) => d.schedule_id === s.id && d.day === day);
        const chosen = current?.photo_url ? 'photo' : current?.item_id ?? (s.symbol_id ?? null);
        const options = more === s.id ? foods.map((f) => f.id) : s.choices;
        return (
          <div key={s.id} className={`plan-slot ${s.choices.length ? 'choice' : ''}`} data-testid={`plan-${s.label}-${s.start_min}`}>
            <div className="plan-head">
              <span className="plan-pic">{pic.photo ? <img src={pic.photo} alt="" /> : pic.emoji}</span>
              <b>{fmtMinutes(s.start_min)} {s.start_min < 720 ? 'am' : 'pm'} · {s.label}</b>
              {pic.picked && <span className="muted small">({pic.label}{current?.set_by ? `, by ${current.set_by}` : ''})</span>}
            </div>
            {s.choices.length > 0 && (
              <>
                <div className="plan-picks">
                  {options.map((id) => (
                    <button key={id} className={`plan-pick ${chosen === id ? 'sel' : ''}`} data-testid={`pick-${s.label}-${id}`} onClick={() => void pick(s, id)}>
                      <b><Pic id={id} /></b>
                      <span>{board.items.find((x) => x.id === id)?.short_label ?? board.items.find((x) => x.id === id)?.labels.en ?? id}</span>
                    </button>
                  ))}
                  <label className={`plan-pick cam ${chosen === 'photo' ? 'sel' : ''}`}>
                    <b>{current?.photo_url ? <img src={current.photo_url} alt="" /> : '📷'}</b>
                    <span>photo</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-testid={`pick-${s.label}-photo`}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void photo(s, f); e.target.value = ''; }} />
                  </label>
                </div>
                <div className="plan-actions">
                  {more !== s.id && <button className="link" data-testid={`more-${s.label}`} onClick={() => setMore(s.id)}>More foods…</button>}
                  {current && <button className="link" data-testid={`reset-${s.label}`} onClick={() => void reset(s)}>Back to the usual</button>}
                </div>
              </>
            )}
          </div>
        );
      })}
      <p className="muted small">A photo is used for that day only. With no pick, the usual picture shows on his timeline.</p>
    </section>
  );
}
