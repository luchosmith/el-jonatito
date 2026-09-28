// Jonatito in the middle, his core things in the inner orbit (every slot fixed), the earth under his
// feet with the places compass on it (home in the centre, people where they are). Tapping Eat opens
// the foods around him; tapping a face on the globe opens that person's screen.
import { useEffect, useState, type MutableRefObject } from 'react';
import { Face } from '../common/Face.tsx';
import { Clock12 } from '../common/Clock12.tsx';
import { INNER_SLOTS, slotStyle } from '../common/orbit.ts';
import { itemToken, shownLabel, type Board, type StripToken } from '../common/board.ts';
import { kindClass } from '../common/Token.tsx';
import { speak } from '../common/hooks.ts';
import { logTap } from '../common/taplog.ts';
import { Sky, type Weather } from './Sky.tsx';
import { PlacesCompass } from './PlacesCompass.tsx';
import type { Season } from '../../../shared/time.ts';
import { fmt12 } from '../../../shared/time.ts';
import type { Item, Lang, Locations, Person } from '../../../shared/types.ts';

interface Props {
  board: Board;
  me: Person | undefined;
  /** null = the main orbit; an item id = that item's sub-orbit (Eat -> foods) */
  parentId: string | null;
  now: Date;
  lang: Lang;
  locations: Locations | null;
  onAdd: (t: StripToken) => void;
  onOpen: (item: Item) => void;
  onPlay: (item: Item) => void;
  onBody: () => void;
  onBack: () => void;
  onPerson: (personId: string) => void;
  /** the time the sky shows (now, or where he dragged the timeline) */
  timeRef: MutableRefObject<number>;
  weather: Weather;
  season: Season;
  /** the time under the NOW line: the sky clock shows it */
  view: Date;
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
      {/* The clock, in the sky under NOW: numbers and hands only, like the clock on his wall. Dragged
          away from now, the span between now and then is shaded; a tap brings it back to now. */}
      <button className="sky-clock" data-testid="sky-clock" onClick={p.onNow} aria-label="Back to now">
        <Clock12 at={p.view} from={p.away ? now : null} size={104} numbers testId="main-clock" />
      </button>

      <div className={`orbit-layer ${p.away ? 'away' : ''}`}>
        <div className="ring inner" />

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

      </div>

      {(
        <PlacesCompass
          board={board}
          locations={p.locations}
          onPerson={p.onPerson}
        />
      )}

      <button
        className="orbit-me"
        data-testid="orbit-me"
        onClick={p.away ? p.onNow : parent ? p.onBack : () => { logTap('body', screen); p.onBody(); }}
        aria-label={p.away ? 'Back to now' : parent ? 'Back' : 'My body'}
      >
        {me && <Face person={me} />}
      </button>
      {/* Caretakers on duty (with him right now): their face circles his, touching it, one slow turn a minute. */}
      {!parent && board.people.filter((pp) => pp.status === 'on_duty' && pp.is_visible).map((pp, k, all) => (
        <div key={pp.id} className="duty-arm" style={{ animationDelay: `${(-k * 60) / all.length}s` }}>
          <button className="duty-face" data-testid={`duty-${pp.id}`} style={{ animationDelay: `${(-k * 60) / all.length}s` }}
            onClick={() => p.onPerson(pp.id)} aria-label={`${pp.short_label} is with you`}>
            <Face person={pp} />
            <i>🛡️</i>
          </button>
        </div>
      ))}
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
