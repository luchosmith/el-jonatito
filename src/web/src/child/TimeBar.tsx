// The time row (under the sentence row): clock, the timeline, and day / season / weather / place.
// v0.9: the timeline is a time compass. NOW is fixed in the centre (in line with his head); the next
// minutes get most of the room, then hours, days and seasons bunch towards the edges (shared/timescale).
// On the orbit he can drag it: left is the past (what he did, voices he heard, photos from his day),
// right is the future (the routine, with today's picks, and what caretakers scheduled).
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Clock12 } from '../common/Clock12.tsx';
import { Face } from '../common/Face.tsx';
import { PainFace } from '../common/PainFace.tsx';
import { DAY_COLORS, SEASON_EMOJI, WEATHER_EMOJI, type Board } from '../common/board.ts';
import { routinePicture } from '../common/routine.ts';
import { fmt12, fmtMinutes, localDay, minutesOfDay, seasonOf, startOfDay } from '../../../shared/time.ts';
import { placeIcons, timeOffsetMin, timeOffsetPx, ZONE, type IconIn } from '../../../shared/timescale.ts';
import type { NowInfo, ScheduleDay, ScheduleItem, TimelineEntry } from '../../../shared/types.ts';

/** How far he can drag, either way. */
export const SCRUB_DAYS = 365;
const DAY = 86_400_000;
const MIN = 60_000;
const HEIGHT = 104;
/** icons stand on this line; ticks and hour numbers are under it */
const BASELINE = HEIGHT - 16;

interface Props {
  now: Date;
  /** the time under the NOW line (now, or where he dragged to) */
  view: Date;
  schedule: ScheduleItem[];
  days: ScheduleDay[];
  info: NowInfo | null;
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
  const { now, view, info } = p;
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
  const away = Math.abs(view.getTime() - now.getTime()) >= MIN;
  const season = seasonOf(view);
  const scrubbedMin = (view.getTime() - now.getTime()) / MIN;

  const pointer = p.scrubbable
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if ((e.target as HTMLElement).closest('.tl-entry, .tl-item')) return;
          drag.current = { x: e.clientX, from: scrubbedMin };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (!drag.current) return;
          // The scale read backwards: a short drag moves minutes, a long one days or months.
          p.onScrub?.(drag.current.from - timeOffsetMin(e.clientX - drag.current.x, width / 2));
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
      <button className="tb-clock" data-testid="tb-clock" onClick={p.onNow} aria-label="Back to now">
        <Clock12 at={view} from={away ? now : null} size={80} numbers={false} testId="main-clock" />
        <span className="digital">
          <span data-testid="digital-time">{fmt12(view)} {view.getHours() < 12 ? 'AM' : 'PM'}</span>
          <small>{view.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</small>
        </span>
      </button>

      <div className={`timeline tb-line ${p.scrubbable ? 'scrub' : ''}`} data-testid="timeline" ref={line} {...pointer}>
        <Track {...p} width={width} />
        <div className="now-marker" data-testid="now-marker" onClick={p.onNow} />
      </div>

      <div className="chips tb-chips">
        <div className="chip" data-testid="chip-day">
          <b className="daydot" style={{ background: DAY_COLORS[view.getDay()] }} />
          {view.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="chip" data-testid="chip-season"><b>{SEASON_EMOJI[season]}</b>{season[0].toUpperCase() + season.slice(1)}</div>
        <div className="chip" data-testid="chip-weather">
          {info?.weather ? <><b>{WEATHER_EMOJI(info.weather.code)}</b>{info.weather.temp_c}°C</> : <b>·</b>}
        </div>
        <div className="chip"><b>🏠</b>{info?.place ?? 'Home'}</div>
      </div>
      <div className="parent-corner" data-testid="parent-corner" {...p.cornerProps} />
    </header>
  );
}

/** A small clock that fills up as something gets closer (the last hour), with the minutes left. */
function SoonClock({ minutes }: { minutes: number }) {
  const f = Math.max(0, Math.min(1, minutes / 60));
  const a = f * 2 * Math.PI;
  const x = 8 + 7 * Math.sin(a);
  const y = 8 - 7 * Math.cos(a);
  return (
    <u className="tl-soon" data-testid="tl-soon">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7.5" fill="#fff" stroke="#b5471b" />
        {f >= 1 ? <circle cx="8" cy="8" r="7" fill="#ffb877" /> : f > 0 && <path d={`M8 8 L8 1 A7 7 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="#ffb877" />}
        <line x1="8" y1="8" x2="8" y2="3" stroke="#1f2a37" strokeWidth="1.5" />
      </svg>
      {Math.ceil(minutes)}′
    </u>
  );
}

interface Icon extends IconIn {
  t: number;
  render: (size: number) => { kind: string; cls: string; pic: ReactNode; badge?: ReactNode; testId?: string; label?: string; onClick?: () => void };
}

function Track({ now, view, schedule, days, entries, board, onEntry, width }: Props & { width: number }) {
  const half = width / 2;
  const focus = view.getTime();
  const X = (t: number) => half + timeOffsetPx((t - focus) / MIN, half);
  const nowT = now.getTime();
  const out: ReactNode[] = [];

  // Zones, faint, both sides: ⏱️ minutes · hours · days · seasons.
  const zones: [string, number, number, string][] = [
    ['min', 0, ZONE.minutes, '⏱️'], ['hr', ZONE.minutes, ZONE.hours, ''], ['day', ZONE.hours, ZONE.days, ''], ['sea', ZONE.days, 1, ''],
  ];
  for (const [c, a, b, lab] of zones) {
    for (const sd of [-1, 1]) {
      const l = sd < 0 ? half - b * half : half + a * half;
      out.push(<div key={`z${c}${sd}`} className={`tz tz-${c}`} style={{ left: l, width: (b - a) * half }}>{lab && <small>{lab}</small>}</div>);
    }
  }

  // Nights: a dark band from bedtime to waking, filled with little beds (not exact, just "sleep").
  const wake = schedule[0]?.start_min ?? 420;
  const sleep = (schedule.find((s) => s.symbol_id === 'bed') ?? schedule[schedule.length - 1])?.start_min ?? 1230;
  const day0 = startOfDay(view);
  const bed = board.items.find((it) => it.id === 'bed');
  for (let d = -15; d <= 15; d++) {
    const night = new Date(day0);
    night.setDate(night.getDate() + d);
    const start = night.getTime() + sleep * MIN;
    const morning = new Date(night);
    morning.setDate(morning.getDate() + 1);
    const end = morning.getTime() + wake * MIN;
    const xs = Math.max(0, X(start));
    const xe = Math.min(width, X(end));
    if (xe - xs < 2) continue;
    out.push(<div key={`n${d}`} className="tb-night" style={{ left: xs, width: xe - xs }} data-testid="tl-night" />);
    const n = Math.floor((xe - xs) / 26);
    for (let k = 0; k < n; k++) {
      out.push(
        <span key={`b${d}-${k}`} className="tl-bed" style={{ left: xs + ((k + 0.5) * (xe - xs)) / n }} data-testid="tl-bed">
          {bed?.photo_url ? <img src={bed.photo_url} alt="" draggable={false} /> : '🛏️'}
        </span>,
      );
    }
  }

  // Ticks: every 15 minutes within the hour, every hour within a day (numbers where they fit); a dot per day after that.
  const ticks: number[] = [];
  const labels: number[] = [];
  const q0 = Math.floor(focus / (15 * MIN)) * 15 * MIN;
  for (let k = 0; k <= 192; k++) {
    const kk = k % 2 ? -(k + 1) / 2 : k / 2; // closest first
    const tm = q0 + kk * 15 * MIN;
    const dm = Math.abs(tm - focus) / MIN;
    const dd = new Date(tm);
    const hour = dd.getMinutes() === 0;
    if (dm > 1440 || (!hour && dm > 60)) continue;
    const x = X(tm);
    if (x < 0 || x > width || ticks.some((o) => Math.abs(o - x) < 3)) continue;
    ticks.push(x);
    out.push(<i key={`t${tm}`} className={`tb-tick ${hour ? 'maj' : ''}`} style={{ left: x }} />);
    if (hour && labels.every((o) => Math.abs(o - x) >= 30)) {
      labels.push(x);
      out.push(<span key={`h${tm}`} className="tb-hr" style={{ left: x }}>{dd.getHours() % 12 || 12}{dd.getHours() < 12 ? 'am' : 'pm'}</span>);
    }
  }
  const dots: number[] = [];
  for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 10, -10, 13, -13]) {
    const noon = new Date(day0);
    noon.setDate(noon.getDate() + d);
    noon.setHours(12);
    const x = X(noon.getTime());
    if (Math.abs(noon.getTime() - focus) < DAY || dots.some((o) => Math.abs(o - x) < 12)) continue;
    dots.push(x);
    out.push(<b key={`d${d}`} className="tb-day" style={{ left: x, background: DAY_COLORS[noon.getDay()] }} />);
  }

  // What goes on the line.
  const icons: Icon[] = [];
  const rankOf = (t: number, planned: boolean) => (Math.abs(t - focus) <= 60 * MIN ? 0 : planned ? 1 : 2);
  const soon = (t: number) => (t > nowT && t - nowT <= 60 * MIN ? <SoonClock minutes={(t - nowT) / MIN} /> : null);

  // The routine, within a day of where he is looking; today's picks win over the everyday picture.
  const today = startOfDay(now).getTime();
  const nowMin = minutesOfDay(now);
  const nextIdx = schedule.findIndex((s) => s.start_min > nowMin);
  const dup = (label: string) => schedule.filter((s) => s.label === label).length > 1;
  for (let d = -1; d <= 1; d++) {
    const date = new Date(day0);
    date.setDate(date.getDate() + d);
    const isToday = date.getTime() === today;
    const dayKey = localDay(date);
    schedule.forEach((s, i) => {
      const t = date.getTime() + s.start_min * MIN;
      if (Math.abs(t - focus) > DAY) return;
      const next = schedule[i + 1]?.start_min ?? 1440;
      const state = !isToday ? '' : next <= nowMin ? 'done' : i === nextIdx ? 'next' : '';
      const pic = routinePicture(s, dayKey, days, board);
      const bedtime = s.symbol_id === 'bed';
      const entry: TimelineEntry = { kind: 'routine', at: new Date(t).toISOString(), label: pic.label, photo_url: pic.photo, emoji: pic.emoji };
      icons.push({
        key: `r${dayKey}-${s.id}`, t, dm: (t - focus) / MIN, rank: rankOf(t, false), big: bedtime,
        render: () => ({
          kind: 'routine',
          cls: `tl-item ${state} ${bedtime ? 'bedtime' : ''} ${pic.picked ? 'picked' : ''}`,
          pic: pic.photo ? <img src={pic.photo} alt="" draggable={false} /> : <b>{pic.emoji}</b>,
          badge: <><span className="tl-time">{fmtMinutes(s.start_min)}</span>{soon(t)}</>,
          testId: isToday ? `tl-${s.label}${dup(s.label) ? `-${s.start_min}` : ''}` : undefined,
          label: `${s.label} ${fmtMinutes(s.start_min)}`,
          onClick: () => onEntry?.(entry),
        }),
      });
    });
  }

  // Seasons: a mark on the first day of each (meteorological, like the chip).
  for (let m = -12; m <= 12; m++) {
    const first = new Date(view.getFullYear(), view.getMonth() + m, 1, 12);
    if (first.getMonth() % 3 !== 2) continue; // Mar, Jun, Sep, Dec
    const t = first.getTime();
    if (Math.abs(t - focus) > SCRUB_DAYS * DAY || Math.abs(t - focus) < DAY) continue;
    const s = seasonOf(first);
    icons.push({
      key: `s${t}`, t, dm: (t - focus) / MIN, rank: 1,
      render: () => ({ kind: 'season', cls: 'tl-season', pic: <b>{SEASON_EMOJI[s]}</b>, testId: 'tl-season', label: s }),
    });
  }

  // What happened (within a day of where he is looking) and what is planned (always).
  const person = (id: string | null | undefined) => (id ? board.people.find((pp) => pp.id === id) : undefined);
  entries.forEach((e, i) => {
    const t = new Date(e.at).getTime();
    const planned = e.kind === 'event' || e.kind === 'photo';
    if (!planned && Math.abs(t - focus) > DAY) return;
    let pic: ReactNode = null;
    let badge: ReactNode = null;
    let cls = 'tl-entry';
    if (e.kind === 'moment') {
      const who = person(e.moment.sent_to[0]) ?? person(e.moment.chips.find((c) => c.kind === 'person')?.id);
      const thing = e.moment.chips.find((c) => c.kind !== 'person' && c.kind !== 'pet');
      pic = who ? <Face person={who} /> : thing?.photo_url ? <img src={thing.photo_url} alt="" /> : <b>{thing?.emoji ?? '💬'}</b>;
      badge = who && thing?.emoji ? <i>{thing.emoji}</i> : null;
      cls += ' face';
    } else if (e.kind === 'voice') {
      const who = person(e.person_id);
      pic = who ? <Face person={who} /> : <b>〰️</b>;
      badge = <i>〰️</i>;
      cls += ' face';
    } else if (e.kind === 'media') {
      pic = e.cover_url ? <img src={e.cover_url} alt="" /> : <b>{e.emoji ?? '🎬'}</b>;
    } else if (e.kind === 'pain') {
      pic = <PainFace level={e.level} size={28} />;
      cls += ' face';
    } else if (e.kind === 'photo' || e.kind === 'event') {
      const who = person(e.event.person_ids[0]);
      pic = e.event.photo_url ? <img src={e.event.photo_url} alt="" /> : <b>{e.event.emoji ?? (who ? '' : '📅')}</b>;
      if (!e.event.photo_url && who && !e.event.emoji) pic = <Face person={who} />;
      badge = who && (e.event.photo_url || e.event.emoji) ? <i className="face-badge"><Face person={who} /></i> : null;
      cls += ` photo ${e.kind === 'event' ? 'future' : ''}`;
    } else return;
    icons.push({
      key: `e${i}-${e.kind}-${e.at}`, t, dm: (t - focus) / MIN, rank: rankOf(t, planned),
      render: () => ({
        kind: e.kind, cls, pic, badge: <>{badge}{e.kind === 'event' && soon(t)}</>, testId: 'tl-entry', onClick: () => onEntry?.(e),
        label: e.kind === 'event' || e.kind === 'photo' ? e.event.title : e.kind,
      }),
    });
  });

  const byKey = new Map(icons.map((ic) => [ic.key, ic]));
  for (const spot of placeIcons(icons, width, HEIGHT, BASELINE)) {
    const ic = byKey.get(spot.key)!;
    const r = ic.render(spot.size);
    if (Math.abs(spot.x - spot.x0) > 3) {
      out.push(<div key={`l${spot.key}`} className="tl-lead" style={{ left: Math.min(spot.x, spot.x0), width: Math.abs(spot.x - spot.x0), top: BASELINE + 3 }} />);
    }
    out.push(<div key={`s${spot.key}`} className="tl-stem" style={{ left: spot.x0, top: spot.top + spot.size, height: Math.max(0, BASELINE + 6 - spot.top - spot.size) }} />);
    const style = { left: spot.x, top: spot.top, width: spot.size, height: spot.size, fontSize: Math.round(spot.size * 0.55) };
    out.push(
      r.onClick ? (
        <button key={spot.key} className={`tl-icon ${r.cls}`} style={style} data-testid={r.testId} data-kind={r.kind} data-x0={Math.round(spot.x0)} aria-label={r.label} onClick={r.onClick}>
          {r.pic}{r.badge}
        </button>
      ) : (
        <span key={spot.key} className={`tl-icon ${r.cls}`} style={style} data-testid={r.testId} title={r.label}>{r.pic}</span>
      ),
    );
  }
  return <>{out}</>;
}
