// The places compass, drawn on the earth: 🏠 home under his head, people where they are. Near things
// sit near the centre; past the 🚗 line a drive away; past the ✈️ line far away, at the edges.
// West on the left, east on the right; not to scale. Pets are small pictures next to home.
import { Face } from '../common/Face.tsx';
import type { Board } from '../common/board.ts';
import { COMPASS_CAR, COMPASS_PLANE, compassX, distanceKm, nearestCity } from '../../../shared/geo.ts';
import type { Locations, Person } from '../../../shared/types.ts';

const GAP = 6.2; // % of the width between two faces on the same row
// Pets huddle around the HOME box (px from its centre), overlapping its corners.
const PET_SPOTS: [number, number][] = [[-72, -10], [72, -10], [92, 42]];
// People at home (same ~10 km cell as home) join the bed cluster: first its upper-left, next to Lexi.
const HOME_KM = 1;
const HOME_SPOTS: [number, number][] = [[-90, -50], [90, -50], [-150, 10], [150, 10]];

export function PlacesCompass({ board, locations, onPerson }: { board: Board; locations: Locations | null; onPerson: (id: string) => void }) {
  if (!locations) return null;
  const home = locations.home;
  const city = nearestCity(home.lat, home.lon).name;
  const homePhoto = board.items.find((i) => i.id === 'home')?.photo_url ?? null;

  // People with a shared location, nearest first; two rows, nudged outwards (never across home) when crowded.
  const shown = locations.people
    .map((l) => ({ l, person: board.people.find((p) => p.id === l.person_id && p.is_visible && !p.is_self) }))
    .filter((x): x is { l: (typeof locations.people)[number]; person: Person } => !!x.person)
    .map((x) => ({ ...x, x: compassX(home, x.l), atHome: distanceKm(home, x.l) < HOME_KM }))
    .sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50));
  const atHome = shown.filter((s) => s.atHome).slice(0, HOME_SPOTS.length);
  // The bed, its pets and the people at home take the middle on both rows; so do the 🚗 / ✈️ markers.
  // Each taken spot: [x %, how much room it needs on each side]. A marker is narrower than a face.
  const markers = [-1, 1].flatMap((sd) => [50 + sd * COMPASS_CAR * 50, 50 + sd * COMPASS_PLANE * 50]).map((x): [number, number] => [x, 4]);
  // the bed cluster spans about ±9.5% of the width; a face needs its own half-width (~3%) beyond that
  const middle = [40.5, 43, 45.5, 48, 50, 52, 54.5, 57, 59.5].map((x): [number, number] => [x, 3]);
  const rows: Record<'high' | 'low', [number, number][]> = { high: [...middle, ...markers], low: [...middle, ...markers] };
  const placed = shown.filter((s) => !atHome.includes(s)).map((s) => {
    let x = s.x;
    for (let tries = 0; tries < 30; tries++) {
      for (const row of ['high', 'low'] as const) {
        if (rows[row].every(([o, room]) => Math.abs(o - x) >= room)) {
          rows[row].push([x, GAP]);
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
      <div className={`cm-home ${homePhoto ? 'photo' : ''}`} data-testid="compass-home">
        {homePhoto ? <img src={homePhoto} alt="" draggable={false} /> : '🏠'}
        <small>HOME · {city}</small>
      </div>
      {pets.map((pet, k) => (
        <span key={pet.id} className="cm-pet" style={{ left: `calc(50% + ${PET_SPOTS[k][0]}px)`, top: `calc(60% + ${PET_SPOTS[k][1]}px)` }} data-testid={`compass-pet-${pet.id}`} aria-hidden>
          {/* the grey filter only tints the placeholder emoji, never a real photo */}
          <Face person={pet} className={!pet.photo_url && pet.breed?.includes('grey') ? 'grey' : ''} />
        </span>
      ))}
      {atHome.map(({ person, l }, k) => (
        <button key={person.id} className="cm-person at-home" data-testid={`compass-${person.id}`} data-home="yes"
          style={{ left: `calc(50% + ${HOME_SPOTS[k][0]}px)`, top: `calc(60% + ${HOME_SPOTS[k][1]}px)` }}
          title={`${person.short_label} · ${l.place_label}`} onClick={() => onPerson(person.id)}>
          <Face person={person} />
        </button>
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
