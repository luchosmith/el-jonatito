// Jonatito's own face, big, as the starting point for a sentence. His core actions float close
// to him (inner orbit); everyone else floats further out (outer orbit). Every tap goes to the strip.
import { Face } from '../common/Face.tsx';
import { personToken, symbolToken, type Board, type StripToken } from '../common/board.ts';
import { kindClass } from '../common/Token.tsx';
import type { Person } from '../../../shared/types.ts';

/** The inner-orbit words, with the short name to show and, optionally, an emoji in place of the word's own picture. */
const CORE_ACTIONS: { id: string; label: string; emoji?: string }[] = [
  { id: 'eat', emoji: '🍇', label: 'Eat' },
  { id: 'bath', emoji: '🛁', label: 'Bath' },
  { id: 'toilet', emoji: '🚽', label: 'Toilet' },
  { id: 'go', emoji: '🚗', label: 'Go' },
  { id: 'barney', label: 'Barney' },
  { id: 'pongo', label: 'Pongo' },
];

// Orbit radii as a percentage of the stage's width / height (an ellipse, so it fits a landscape tablet).
const INNER = { rx: 20, ry: 30 };
const OUTER = { rx: 40, ry: 38 };

function at(orbit: { rx: number; ry: number }, angle: number) {
  return { left: `${50 + orbit.rx * Math.cos(angle)}%`, top: `${50 + orbit.ry * Math.sin(angle)}%` };
}

const STATUS_MARK: Record<string, string> = { busy: '⏳', away: '🚫' };

export function OrbitView({ board, me, onAdd }: { board: Board; me: Person | undefined; onAdd: (t: StripToken) => void }) {
  const actions = CORE_ACTIONS.flatMap((a) => {
    const s = board.symbols.find((x) => x.id === a.id && !x.is_hidden);
    return s ? [{ ...a, token: a.emoji ? { ...symbolToken(s), emoji: a.emoji, photo_url: null } : symbolToken(s) }] : [];
  });
  const people = board.people.filter((p) => !p.is_self && p.kind === 'person' && p.is_visible);

  return (
    <div className="orbit" data-testid="orbit">
      <div className="ring inner" />
      <div className="ring outer" />

      {me && (
        <div className="orbit-me" data-testid="orbit-me">
          <Face person={me} />
        </div>
      )}

      {actions.map((a, i) => (
        <button
          key={a.id}
          className={`orb act ${kindClass(a.token.kind)}`}
          data-testid={`orbit-${a.id}`}
          style={{ ...at(INNER, -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / actions.length), animationDelay: `${i * -0.7}s` }}
          onClick={() => onAdd(a.token)}
        >
          {a.token.photo_url ? <img src={a.token.photo_url} alt="" draggable={false} /> : <b>{a.token.emoji}</b>}
          <span>{a.label}</span>
        </button>
      ))}

      {people.map((p, i) => {
        const status = p.status ?? 'available';
        return (
          <button
            key={p.id}
            className={`orb who ${status}`}
            data-testid={`orbit-${p.id}`}
            data-status={status}
            style={{ ...at(OUTER, -Math.PI / 2 + (i * 2 * Math.PI) / people.length), animationDelay: `${i * -0.9}s` }}
            onClick={() => onAdd(personToken(p))}
          >
            <Face person={p} />
            {STATUS_MARK[status] && <i className="not-avail" aria-label={status}>{STATUS_MARK[status]}</i>}
            <span>{p.short_label}</span>
          </button>
        );
      })}
    </div>
  );
}
