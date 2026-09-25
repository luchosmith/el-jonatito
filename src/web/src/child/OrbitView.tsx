// Jonatito in the middle; his core things in the inner orbit, his people in the outer one, the
// ground under his feet. Every slot is fixed. Tapping Eat opens the foods around him.
import { useEffect, useState } from 'react';
import { Face, SoundWave } from '../common/Face.tsx';
import { Clock12 } from '../common/Clock12.tsx';
import { INNER_SLOTS, slotStyle } from '../common/orbit.ts';
import { itemToken, personToken, shownLabel, type Board, type StripToken } from '../common/board.ts';
import { kindClass } from '../common/Token.tsx';
import { speak } from '../common/hooks.ts';
import { Globe } from './Globe.tsx';
import { fmt12 } from '../../../shared/time.ts';
import type { Item, Lang, Locations, Person } from '../../../shared/types.ts';

interface Props {
  board: Board;
  me: Person | undefined;
  /** null = the main orbit; an item id = that item's sub-orbit (Eat -> foods) */
  parentId: string | null;
  now: Date;
  lang: Lang;
  unheard: Record<string, number>;
  locations: Locations | null;
  onAdd: (t: StripToken) => void;
  onOpen: (item: Item) => void;
  onPlay: (item: Item) => void;
  onBody: () => void;
  onBack: () => void;
  onPerson: (personId: string) => void;
  onHearNewest: (personId: string) => void;
}

export function OrbitView(p: Props) {
  const { board, me, parentId, now, lang } = p;
  const [tip, setTip] = useState<{ item: Item; at: Date } | null>(null);
  const [where, setWhere] = useState<string | null>(null);
  const parent = parentId ? board.items.find((i) => i.id === parentId) : undefined;

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 4000);
    return () => clearTimeout(t);
  }, [tip]);
  useEffect(() => {
    if (!where) return;
    const t = setTimeout(() => setWhere(null), 6000);
    return () => clearTimeout(t);
  }, [where]);

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
      setTip({ item, at: closed });
      speak(`${item.labels[lang] || item.labels.en} ${lang === 'es' ? 'a las' : 'at'} ${fmt12(closed)}`, lang);
      return;
    }
    if (item.tap === 'play') return p.onPlay(item);
    p.onAdd(itemToken(item, lang));
    if (item.tap === 'open') p.onOpen(item);
  };

  const tapPerson = (item: Item, person: Person) => {
    p.onAdd(personToken(person, item, lang));
    setWhere(person.id);
  };

  const wherePerson = where ? board.people.find((x) => x.id === where) : undefined;
  const whereLoc = where ? p.locations?.people.find((l) => l.person_id === where) ?? null : null;

  return (
    <div className="orbit" data-testid="orbit" data-parent={parentId ?? ''}>
      <div className="ground" aria-hidden />
      <div className="ground-pin" data-testid="ground-pin">
        <span className="pf">{me && <Face person={me} />}</span>
        <i />
      </div>

      <div className={`orbit-layer ${wherePerson ? 'dim' : ''}`}>
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
            >
              <b className="c">{item.photo_url ? <img src={item.photo_url} alt="" draggable={false} /> : item.emoji}</b>
              {item.badge_color && <i className="badge" style={{ background: item.badge_color }} />}
              <span>{shownLabel(item)}</span>
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
              onClick={() => tapPerson(item, person)}
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

        <button className="orbit-me" data-testid="orbit-me" onClick={parent ? p.onBack : p.onBody} aria-label={parent ? 'Back' : 'My body'}>
          {me && <Face person={me} />}
        </button>
        {parent && (
          <button className={`orbit-parent ${kindClass(parent.kind)}`} data-testid="orbit-parent" onClick={p.onBack}>
            {parent.photo_url ? <img src={parent.photo_url} alt="" /> : parent.emoji}
          </button>
        )}
      </div>

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

      {wherePerson && p.locations && (
        <button className="globe-pop" data-testid="globe-pop" data-person={wherePerson.id} onClick={() => p.onPerson(wherePerson.id)}>
          <Globe home={p.locations.home} homePhoto={me?.photo_url ?? null} other={{ place: whereLoc, photo: wherePerson.photo_url, emoji: wherePerson.emoji }} />
          <span className="gchip">
            <Face person={wherePerson} />
            {whereLoc ? <b>{whereLoc.place_label}</b> : <b>❔</b>}
          </span>
        </button>
      )}
    </div>
  );
}

function suggestion(board: Board, item: Item) {
  const id = item.rules.find((r) => r.kind === 'limit' && r.suggest_item_id)?.suggest_item_id;
  const s = id ? board.items.find((i) => i.id === id) : undefined;
  return s ? <span className="suggest" data-testid="closed-suggest">→ {s.photo_url ? <img src={s.photo_url} alt="" /> : s.emoji}</span> : null;
}
