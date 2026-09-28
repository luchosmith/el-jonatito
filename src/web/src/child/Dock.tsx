// Bottom bar: Jonatito's own face where the Start button would be (back to the orbit), then family
// (each opens their person screen), then his favourite things (Pongo, Barney), then All words / My day / Media.
// Pets are not in the dock (they stay on the board's People page).
import { Face, SoundWave } from '../common/Face.tsx';
import { Clock12 } from '../common/Clock12.tsx';
import { shownLabel } from '../common/board.ts';
import { kindClass } from '../common/Token.tsx';
import type { Item, Person } from '../../../shared/types.ts';

export function Dock({ people, things, unheard, unreadText, meActive, boardActive, onMe, onPerson, onThing, onBoard, onDay, onMedia }: {
  people: Person[];
  things: Item[];
  onThing: (item: Item) => void;
  unheard: Record<string, number>;
  unreadText: Record<string, number>;
  meActive: boolean;
  boardActive: boolean;
  onMe: () => void;
  onPerson: (p: Person) => void;
  onBoard: () => void;
  onDay: () => void;
  onMedia: () => void;
}) {
  const me = people.find((p) => p.is_self);
  const family = people.filter((p) => !p.is_self && p.kind === 'person' && p.is_visible);
  const ring = (p: Person) => (p.status === 'busy' ? 'busy' : p.status === 'away' ? 'away' : '');

  return (
    <footer className="dock" data-testid="dock">
      {me && (
        <button className={`me ${meActive ? 'on' : ''}`} data-testid="me-button" onClick={onMe} aria-label="Me">
          <Face person={me} />
        </button>
      )}
      <div className="sep" />
      <div className="people">
        {family.map((p) => (
          <button key={p.id} className={`av ${ring(p)}`} data-testid={`dock-${p.id}`} data-status={p.status ?? 'available'} onClick={() => onPerson(p)}>
            <Face person={p} />
            {/* not available: a clock of when they are free, or 🚫 */}
            {p.status === 'busy' && (
              <i className="dk-status" data-testid={`busy-${p.id}`}>
                {p.status_until ? <Clock12 at={new Date(p.status_until)} size={22} /> : '🟡'}
              </i>
            )}
            {p.status === 'away' && <i className="dk-status" data-testid={`away-${p.id}`}>🚫</i>}
            {p.status === 'on_duty' && <i className="dk-status" data-testid={`duty-badge-${p.id}`}>🛡️</i>}
            {/* something new waiting: voice notes he hasn't heard, typed replies he hasn't seen */}
            {(unheard[p.id] ?? 0) > 0 && (
              <i className="vbadge" data-testid={`dock-voice-${p.id}`} data-count={unheard[p.id]}>
                <SoundWave width={22} />
                {unheard[p.id] > 1 && <b className="n">{unheard[p.id]}</b>}
              </i>
            )}
            {(unreadText[p.id] ?? 0) > 0 && (
              <i className="tbadge" data-testid={`dock-text-${p.id}`} data-count={unreadText[p.id]}>
                💬{unreadText[p.id] > 1 && <b>{unreadText[p.id]}</b>}
              </i>
            )}
            <span>{p.short_label}</span>
          </button>
        ))}
        {things.length > 0 && (
          <>
            <div className="sep" />
            {things.map((it) => (
              <button key={it.id} className={`av thing ${kindClass(it.kind)}`} data-testid={`dock-${it.id}`} onClick={() => onThing(it)}
                aria-label={shownLabel(it)} title={shownLabel(it)}>
                {it.photo_url ? <img src={it.photo_url} alt="" draggable={false} /> : <b className="thing-emoji">{it.emoji}</b>}
              </button>
            ))}
          </>
        )}
      </div>
      <button className={`dockbtn ${boardActive ? 'on' : ''}`} data-testid="open-board" onClick={onBoard} aria-label="All words">🔲</button>
      <button className="dockbtn" data-testid="open-day" onClick={onDay}>🍽️</button>
      <button className="dockbtn" data-testid="open-media" onClick={onMedia}>🎬</button>
    </footer>
  );
}
