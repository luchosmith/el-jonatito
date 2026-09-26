// Jonatito in the middle; his core things in the inner orbit, his people in the outer one, the
// ground under his feet. Every slot is fixed. Tapping Eat opens the foods around him; tapping a
// person opens their person screen.
import { useEffect, useState, type MutableRefObject } from 'react';
import { Face, SoundWave } from '../common/Face.tsx';
import { Clock12 } from '../common/Clock12.tsx';
import { INNER_SLOTS, slotStyle } from '../common/orbit.ts';
import { itemToken, shownLabel, type Board, type StripToken } from '../common/board.ts';
import { kindClass } from '../common/Token.tsx';
import { speak } from '../common/hooks.ts';
import { logTap } from '../common/taplog.ts';
import { Sky, type Weather } from './Sky.tsx';
import type { Season } from '../../../shared/time.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { Item, Lang, Person } from '../../../shared/types.ts';

interface Props {
  board: Board;
  me: Person | undefined;
  /** null = the main orbit; an item id = that item's sub-orbit (Eat -> foods) */
  parentId: string | null;
  now: Date;
  lang: Lang;
  unheard: Record<string, number>;
  onAdd: (t: StripToken) => void;
  onOpen: (item: Item) => void;
  onPlay: (item: Item) => void;
  onBody: () => void;
  onBack: () => void;
  onPerson: (personId: string) => void;
  onHearNewest: (personId: string) => void;
  /** the time the sky shows (now, or where he dragged the timeline) */
  timeRef: MutableRefObject<number>;
  weather: Weather;
  season: Season;
  /** dragged away from NOW: the orbit dims; his face brings him back */
  away: boolean;
  onNow: () => void;
}

export function OrbitView(p: Props) {
  const { board, me, parentId, now, lang } = p;
  const [tip, setTip] = useState<{ item: Item; at: Date } | null>(null);
  const parent = parentId ? board.items.find((i) => i.id === parentId) : undefined;
  const screen = parentId ? `orbit:${parentId}` : 'orbit';

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 4000);
    return () => clearTimeout(t);
  }, [tip]);

  const inner = board.items.filter((i) => i.orbit === 'inner' && (i.parent_id ?? null) === parentId && !i.is_hidden && i.orbit_slot != null);
  const used = new Set(inner.map((i) => i.orbit_slot));
  const outer = board.items
    .filter((i) => i.orbit === 'outer' && !i.parent_id && !i.is_hidden && i.orbit_slot != null)
    .map((i) => ({ item: i, person: board.people.find((x) => x.id === i.id) }))
    .filter((x): x is { item: Item; person: Person } => !!x.person);

  const closedUntil = (i: Item) => (i.closed_until && new Date(i.closed_until) > now ? new Date(i.closed_until) : null);
  const nextOpen = inner.map(closedUntil).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
  const nextOpenItem = nextOpen && inner.find((i) => closedUntil(i)?.getTime() === nextOpen.getTime());

  const tapItem = (item: Item) => {
    const closed = closedUntil(item);
    if (closed) {
      logTap('closed', screen, { item_id: item.id }, { closed_until: closed.toISOString() });
      setTip({ item, at: closed });
      speak(`${item.labels[lang] || item.labels.en} ${lang === 'es' ? 'a las' : 'at'} ${fmt12(closed)}`, lang);
      return;
    }
    if (item.tap === 'play') {
      logTap('media', screen, { item_id: item.id });
      return p.onPlay(item);
    }
    p.onAdd(itemToken(item, lang));
    if (item.tap === 'open') {
      logTap('open', screen, { item_id: item.id });
      p.onOpen(item);
    }
  };


  return (
    <div className="orbit" data-testid="orbit" data-parent={parentId ?? ''}>
      <Sky timeRef={p.timeRef} weather={p.weather} season={p.season} />
      <div className="now-guide" aria-hidden />

      <div className={`orbit-layer ${p.away ? 'away' : ''}`}>
        <div className="ring inner" />
        <div className="ring outer" />

        {Array.from({ length: INNER_SLOTS }, (_, s) => s).filter((s) => !used.has(s)).map((s) => (
          <div key={s} className="orb empty" style={slotStyle('inner', s)} data-testid={`orbit-empty-${s}`} />
        ))}

        {inner.map((item) => {
          const closed = closedUntil(item);
          return (
            <button
              key={item.id}
              className={`orb act ${kindClass(item.kind)} ${closed ? 'closed' : ''}`}
              data-testid={`orbit-${item.id}`}
              data-slot={item.orbit_slot}
              data-closed={closed ? closed.toISOString() : ''}
              style={{ ...slotStyle('inner', item.orbit_slot!), animationDelay: `${item.orbit_slot! * -0.6}s` }}
              onClick={() => tapItem(item)}
              aria-label={shownLabel(item)}
              title={shownLabel(item)}
            >
              {/* The picture fills the circle; the name is only for screen readers and caretakers (Items). */}
              <b className="c">{item.photo_url ? <img src={item.photo_url} alt="" draggable={false} /> : item.emoji}</b>
              {item.badge_color && <i className="badge" style={{ background: item.badge_color }} />}
              {closed && <i className="ck"><Clock12 at={closed} from={now} size={30} /></i>}
            </button>
          );
        })}

        {outer.map(({ item, person }) => {
          const status = person.status ?? 'available';
          const n = p.unheard[person.id] ?? 0;
          return (
            <button
              key={item.id}
              className={`orb who ${status}`}
              data-testid={`orbit-${person.id}`}
              data-status={status}
              data-slot={item.orbit_slot}
              style={{ ...slotStyle('outer', item.orbit_slot!), animationDelay: `${item.orbit_slot! * -0.9}s` }}
              onClick={() => {
                logTap('person', screen, { person_id: person.id });
                p.onPerson(person.id);
              }}
            >
              <Face person={person} />
              {status === 'busy' && (
                <i className="not-avail" data-testid={`busy-${person.id}`}>
                  {person.status_until ? <Clock12 at={new Date(person.status_until)} from={now} size={26} /> : '🟡'}
                </i>
              )}
              {status === 'away' && <i className="not-avail" data-testid={`away-${person.id}`}>🚫</i>}
              {n > 0 && (
                <span
                  className="vbadge"
                  role="button"
                  data-testid={`voice-badge-${person.id}`}
                  data-count={n}
                  onClick={(e) => {
                    e.stopPropagation();
                    logTap('hear', screen, { person_id: person.id });
                    p.onHearNewest(person.id);
                  }}
                >
                  <SoundWave width={26} />
                  {n > 1 && <i className="n">{n}</i>}
                </span>
              )}
              <span className="nm">{person.short_label}</span>
            </button>
          );
        })}
      </div>

      <button
        className="orbit-me"
        data-testid="orbit-me"
        onClick={p.away ? p.onNow : parent ? p.onBack : () => { logTap('body', screen); p.onBody(); }}
        aria-label={p.away ? 'Back to now' : parent ? 'Back' : 'My body'}
      >
        {me && <Face person={me} />}
      </button>
      {parent && !p.away && (
        <button className={`orbit-parent ${kindClass(parent.kind)}`} data-testid="orbit-parent" onClick={p.onBack}>
          {parent.photo_url ? <img src={parent.photo_url} alt="" /> : parent.emoji}
        </button>
      )}

      {parent && nextOpen && nextOpenItem && (
        <div className="next-open" data-testid="next-open">
          <b>{nextOpenItem.photo_url ? <img src={nextOpenItem.photo_url} alt="" /> : nextOpenItem.emoji}</b>
          <Clock12 at={nextOpen} from={now} size={64} />
          <b className="time">{fmt12(nextOpen)}</b>
        </div>
      )}

      {tip && (
        <div className="closed-tip" data-testid="closed-tip" style={slotStyle('inner', tip.item.orbit_slot ?? 0)}>
          <b>{tip.item.photo_url ? <img src={tip.item.photo_url} alt="" /> : tip.item.emoji}</b>
          <Clock12 at={tip.at} from={now} size={72} />
          <b className="time">{fmt12(tip.at)}</b>
          {tip.item.closed_by === 'limit' && suggestion(board, tip.item)}
        </div>
      )}

    </div>
  );
}

function suggestion(board: Board, item: Item) {
  const id = item.rules.find((r) => r.kind === 'limit' && r.suggest_item_id)?.suggest_item_id;
  const s = id ? board.items.find((i) => i.id === id) : undefined;
  return s ? <span className="suggest" data-testid="closed-suggest">→ {s.photo_url ? <img src={s.photo_url} alt="" /> : s.emoji}</span> : null;
}
