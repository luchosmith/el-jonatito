// The places compass, drawn on the earth: 🏠 home under his head, people where they are. Near things
// sit near the centre; past the 🚗 line a drive away; past the ✈️ line far away, at the edges.
// West on the left, east on the right; not to scale. Pets are small pictures next to home.
import { Face } from '../common/Face.tsx';
import type { Board } from '../common/board.ts';
import { COMPASS_CAR, COMPASS_PLANE, compassX, nearestCity } from '../../../shared/geo.ts';
import type { Locations, Person } from '../../../shared/types.ts';

const GAP = 4.2; // % of the width between two faces on the same row
const PET_SPOTS: [number, 'high' | 'low'][] = [[-5.5, 'high'], [5.5, 'high'], [9, 'low'], [-9, 'low']];

export function PlacesCompass({ board, locations, onPerson }: { board: Board; locations: Locations | null; onPerson: (id: string) => void }) {
  if (!locations) return null;
  const home = locations.home;
  const city = nearestCity(home.lat, home.lon).name;

  // People with a shared location, nearest first; two rows, nudged outwards (never across home) when crowded.
  const shown = locations.people
    .map((l) => ({ l, person: board.people.find((p) => p.id === l.person_id && p.is_visible && !p.is_self) }))
    .filter((x): x is { l: (typeof locations.people)[number]; person: Person } => !!x.person)
    .map((x) => ({ ...x, x: compassX(home, x.l) }))
    .sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50));
  const rows: Record<'high' | 'low', number[]> = { high: [...PET_SPOTS.filter(([, r]) => r === 'high').map(([d]) => 50 + d), 50], low: [...PET_SPOTS.filter(([, r]) => r === 'low').map(([d]) => 50 + d), 50] };
  const placed = shown.map((s) => {
    let x = s.x;
    for (let tries = 0; tries < 30; tries++) {
      for (const row of ['high', 'low'] as const) {
        if (rows[row].every((o) => Math.abs(o - x) >= GAP)) {
          rows[row].push(x);
          return { ...s, x: Math.min(97, Math.max(3, x)), row };
        }
      }
      x += x >= 50 ? 1.2 : -1.2;
    }
    return { ...s, row: 'high' as const };
  });
  const pets = board.people.filter((p) => p.kind === 'pet' && p.is_visible).slice(0, PET_SPOTS.length);

  return (
    <div className="compass" data-testid="compass">
      {[-1, 1].map((side) => (
        <span key={side}>
          <i className="cm-line" style={{ left: `${50 + side * COMPASS_CAR * 50}%` }}><b>🚗</b></i>
          <i className="cm-line" style={{ left: `${50 + side * COMPASS_PLANE * 50}%` }}><b>✈️</b></i>
        </span>
      ))}
      <div className="cm-walk" />
      <div className="cm-home" data-testid="compass-home">🏠<small>HOME · {city}</small></div>
      {pets.map((pet, k) => (
        <span key={pet.id} className={`cm-pet ${PET_SPOTS[k][1]}`} style={{ left: `${50 + PET_SPOTS[k][0]}%` }} data-testid={`compass-pet-${pet.id}`} aria-hidden>
          <Face person={pet} className={pet.breed?.includes('grey') ? 'grey' : ''} />
        </span>
      ))}
      {placed.map(({ person, x, row, l }) => (
        <button key={person.id} className={`cm-person ${row}`} style={{ left: `${x}%` }} data-testid={`compass-${person.id}`} data-x={x.toFixed(1)}
          title={`${person.short_label} · ${l.place_label}`} onClick={() => onPerson(person.id)}>
          <Face person={person} />
        </button>
      ))}
    </div>
  );
}
