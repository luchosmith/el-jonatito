// Bottom bar: Jonatito's own face where the Start button would be, then family, then pets.
import { Face } from '../common/Face.tsx';
import type { Person } from '../../../shared/types.ts';

export function Dock({ people, onMe, onPerson, onDay, onMedia }: {
  people: Person[];
  onMe: () => void;
  onPerson: (p: Person) => void;
  onDay: () => void;
  onMedia: () => void;
}) {
  const me = people.find((p) => p.is_self);
  const family = people.filter((p) => !p.is_self && p.kind === 'person' && p.is_visible);
  const pets = people.filter((p) => p.kind === 'pet' && p.is_visible);
  const ring = (p: Person) => (p.status === 'busy' ? 'busy' : p.status === 'away' ? 'away' : '');

  return (
    <footer className="dock" data-testid="dock">
      {me && (
        <button className="me" data-testid="me-button" onClick={onMe} aria-label="Me">
          <Face person={me} />
        </button>
      )}
      <div className="sep" />
      <div className="people">
        {family.map((p) => (
          <button key={p.id} className={`av ${ring(p)}`} data-testid={`dock-${p.id}`} data-status={p.status ?? 'available'} onClick={() => onPerson(p)}>
            <Face person={p} />
            <span>{p.short_label}</span>
          </button>
        ))}
        {pets.length > 0 && (
          <>
            <div className="sep" />
            <div className="pets">
              <div className="petlbl">🐾</div>
              <div className="pet-row">
                {pets.map((p) => (
                  <button key={p.id} className="av pet" data-testid={`dock-${p.id}`} onClick={() => onPerson(p)}>
                    <Face person={p} className={p.breed?.includes('grey') ? 'grey' : ''} />
                    <span>{p.short_label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <button className="dockbtn" data-testid="open-day" onClick={onDay}>🍽️</button>
      <button className="dockbtn" data-testid="open-media" onClick={onMedia}>🎬</button>
    </footer>
  );
}
