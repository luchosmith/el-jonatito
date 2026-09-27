// The time row (under the sentence row): a timeline, the full width of the screen, that moves under a
// fixed NOW line in the centre (in line with his head). The clock is in the sky (OrbitView); day,
// season, weather and place are shown in the main view itself.
// On the orbit he can drag it: left is the past (what he did, voices he heard, photos from his day),
// right is the future (only what is scheduled).
import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Face } from '../common/Face.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { DAY_COLORS, type Board } from '../common/board.ts';
import { fmtMinutes, minutesOfDay, startOfDay } from '../../../shared/time.ts';
import type { ScheduleItem, TimelineEntry } from '../../../shared/types.ts';

export const PX_PER_MIN = 1.1;
export const PAST_DAYS = 3;
export const FUTURE_DAYS = 7;
const DAY = 86_400_000;
/** full-size pictures (sleep, the morning chain): 72 px and a small gap */
const BIG_PITCH = 76;
/** an event's picture repeated across its block */
const EVENT_PITCH = 50;

interface Props {
  now: Date;
  /** the time under the NOW line (now, or where he dragged to) */
  view: Date;
  schedule: ScheduleItem[];
  entries: TimelineEntry[];
  board: Board;
  scrubbable: boolean;
  onScrub?: (minutesFromNow: number) => void;
  onScrubEnd?: () => void;
  onNow?: () => void;
  onEntry?: (e: TimelineEntry) => void;
  cornerProps?: Record<string, unknown>;
}

export function TimeBar(p: Props) {
  const { now, view, schedule, board } = p;
  const drag = useRef<{ x: number; from: number } | null>(null);
  const line = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = line.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const away = Math.abs(view.getTime() - now.getTime()) >= 60_000;
  const origin = useMemo(() => {
    const d = startOfDay(now);
    d.setDate(d.getDate() - PAST_DAYS);
    return d.getTime();
  }, [now.toDateString()]);
  const x = (t: number) => ((t - origin) / 60_000) * PX_PER_MIN;
  const shift = width / 2 - x(view.getTime());
  const scrubbedMin = (view.getTime() - now.getTime()) / 60_000;

  const pointer = p.scrubbable
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if ((e.target as HTMLElement).closest('.tl-entry')) return;
          drag.current = { x: e.clientX, from: scrubbedMin };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (!drag.current) return;
          p.onScrub?.(drag.current.from - (e.clientX - drag.current.x) / PX_PER_MIN);
        },
        onPointerUp: () => {
          if (!drag.current) return;
          drag.current = null;
          p.onScrubEnd?.();
        },
      }
    : {};

  return (
    <header className={`here tbar ${away ? 'away' : ''}`} data-testid="here-now" data-away={away ? 'yes' : 'no'}>
      <div className={`timeline tb-line ${p.scrubbable ? 'scrub' : ''}`} data-testid="timeline" ref={line} {...pointer}>
        <div className="tb-track" style={{ transform: `translateX(${shift}px)` }}>
          <Track origin={origin} now={now} schedule={schedule} entries={p.entries} board={board} onEntry={p.onEntry} />
        </div>
        <div className="now-marker" data-testid="now-marker" onClick={p.onNow} />
      </div>

      <div className="parent-corner" data-testid="parent-corner" {...p.cornerProps} />
    </header>
  );
}

/** Everything on the moving strip; only re-rendered when the data changes, not while dragging. */
const Track = memo(function Track({ origin, now, schedule, entries, board, onEntry }: {
  origin: number; now: Date; schedule: ScheduleItem[]; entries: TimelineEntry[]; board: Board; onEntry?: (e: TimelineEntry) => void;
}) {
  const x = (t: number) => ((t - origin) / 60_000) * PX_PER_MIN;
  const wake = schedule[0]?.start_min ?? 420;
  const sleep = schedule[schedule.length - 1]?.start_min ?? 1230;
  const nowMin = minutesOfDay(now);
  const todayStart = startOfDay(now).getTime();
  const nextIdx = schedule.findIndex((s) => s.start_min > nowMin);
  const out: ReactNode[] = [];
  const photoOf = (id: string | null) => (id ? board.items.find((it) => it.id === id)?.photo_url ?? null : null);
  // Big pictures chain: each starts on its tick, or right where the big picture (or block) before it ends.
  let chainRight = -Infinity;

  for (let d = 0; d < PAST_DAYS + FUTURE_DAYS + 1; d++) {
    const day = origin + d * DAY;
    const isToday = day === todayStart;
    out.push(<div key={`n${d}`} className="tb-night" style={{ left: x(day + sleep * 60_000), width: (1440 - sleep + wake) * PX_PER_MIN }} />);
    for (let h = 0; h < 24; h++) {
      out.push(<i key={`t${d}-${h}`} className={`tb-tick ${h % 3 ? '' : 'maj'}`} style={{ left: x(day + h * 3_600_000) }} />);
      if (h % 3 === 0 && h) out.push(<span key={`h${d}-${h}`} className="tb-hr" style={{ left: x(day + h * 3_600_000) }}>{h % 12 || 12}</span>);
    }
    out.push(<span key={`m${d}`} className="tb-mid" style={{ left: x(day) }}><b style={{ background: DAY_COLORS[new Date(day).getDay()] }} /></span>);
    schedule.forEach((s, i) => {
      const next = schedule[i + 1]?.start_min ?? 1440;
      const cls = !isToday ? '' : next <= nowMin ? 'done' : i === nextIdx ? 'next' : '';
      const photo = photoOf(s.symbol_id);
      const pic = photo ? <img src={photo} alt="" draggable={false} /> : <b>{s.symbol_emoji}</b>;
      const t = day + s.start_min * 60_000;
      const testId = isToday ? { 'data-testid': `tl-${s.label}` } : {};
      if (s.end_min != null) {
        // A block (sleep): full-size pictures laid from its start, the last one cut off at its end. No time written.
        const end = day + (s.end_min <= s.start_min ? DAY : 0) + s.end_min * 60_000;
        const w = x(end) - x(t);
        out.push(
          <div key={`r${d}-${s.id}`} className={`tl-block ${cls}`} style={{ left: x(t), width: w }} {...testId}>
            {Array.from({ length: Math.ceil(w / BIG_PITCH) }, (_, k) => <span key={k} className="tl-big" style={{ left: k * BIG_PITCH }}>{pic}</span>)}
          </div>,
        );
        chainRight = x(end);
      } else if (s.big) {
        // In the morning chain: its left edge on its tick, or right after the big picture before it.
        const left = Math.max(x(t), chainRight);
        chainRight = left + BIG_PITCH;
        out.push(<div key={`r${d}-${s.id}`} className={`tl-block one ${cls}`} style={{ left, width: BIG_PITCH }} {...testId}><span className="tl-big">{pic}</span></div>);
      } else {
        out.push(
          <span key={`r${d}-${s.id}`} className={`tl-item tb-rt ${cls}`} style={{ left: x(t) }} {...testId}>
            {photo ? <img src={photo} alt="" draggable={false} /> : s.symbol_emoji}
            <span>{fmtMinutes(s.start_min)}</span>
          </span>,
        );
      }
    });
  }

  const person = (id: string | null | undefined) => (id ? board.people.find((pp) => pp.id === id) : undefined);
  for (const e of entries) {
    const t = new Date(e.at).getTime();
    let pic: ReactNode = null;
    let badge: string | null = null;
    let cls = '';
    if (e.kind === 'moment') {
      const who = person(e.moment.sent_to[0]) ?? person(e.moment.chips.find((c) => c.kind === 'person')?.id);
      const thing = e.moment.chips.find((c) => c.kind !== 'person' && c.kind !== 'pet');
      pic = who ? <Face person={who} /> : thing?.photo_url ? <img src={thing.photo_url} alt="" /> : <b>{thing?.emoji ?? '💬'}</b>;
      badge = who ? thing?.emoji ?? null : null;
    } else if (e.kind === 'voice') {
      const who = person(e.person_id);
      pic = who ? <Face person={who} /> : <b>〰️</b>;
      badge = '〰️';
    } else if (e.kind === 'media') {
      pic = e.cover_url ? <img src={e.cover_url} alt="" /> : <b>{e.emoji ?? '🎬'}</b>;
    } else if (e.kind === 'pain') {
      pic = <PainFace level={e.level} size={28} />;
    } else if (e.kind === 'photo' || e.kind === 'event') {
      cls = e.event.photo_url ? 'photo' : '';
      const who = person(e.event.person_ids[0]);
      pic = e.event.photo_url ? <img src={e.event.photo_url} alt="" /> : who ? <Face person={who} /> : <b>{e.event.emoji ?? '📅'}</b>;
      badge = e.event.photo_url ? null : e.event.emoji;
      if (e.kind === 'event') cls += ' future';
    } else continue;
    const ends = e.kind === 'event' && e.event.ends_at ? new Date(e.event.ends_at).getTime() : null;
    if (ends && ends > t) {
      // A block: its picture repeats from its start, the last one cut off at its end, along a thin line.
      const w = x(ends) - x(t);
      out.push(
        <div key={`e-${e.kind}-${e.at}-${out.length}`} className="tl-span-wrap" style={{ left: x(t), width: w }}>
          <i className="tl-span" />
          {Array.from({ length: Math.ceil(w / EVENT_PITCH) }, (_, k) => (
            <button key={k} className={`tl-entry ${cls}`} style={{ left: k * EVENT_PITCH + EVENT_PITCH / 2 - 3 }} data-testid={k ? 'tl-entry-more' : 'tl-entry'} data-kind={e.kind}
              onClick={() => onEntry?.(e)}>
              {pic}
              {badge && !k && <i>{badge}</i>}
            </button>
          ))}
        </div>,
      );
      continue;
    }
    out.push(
      <button key={`e-${e.kind}-${e.at}-${out.length}`} className={`tl-entry ${cls}`} style={{ left: x(t) }} data-testid="tl-entry" data-kind={e.kind}
        onClick={() => onEntry?.(e)}>
        {pic}
        {badge && <i>{badge}</i>}
      </button>,
    );
  }
  return <>{out}</>;
});
