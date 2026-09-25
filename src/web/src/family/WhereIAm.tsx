// "Where I am": the city Jonatito sees your pin in. City level only; optional "back on" date.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { coarse, flagOf, nearestCity, searchCities } from '../../../shared/geo.ts';
import type { City } from '../../../shared/cities.ts';
import type { Locations, PersonLocation, User } from '../../../shared/types.ts';

export function WhereIAm({ user }: { user: User }) {
  const [current, setCurrent] = useState<PersonLocation | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<{ city: City; source: 'manual' | 'phone'; lat: number; lon: number } | null>(null);
  const [until, setUntil] = useState('');
  const [msg, setMsg] = useState('');

  const load = () =>
    api.get<Locations>('/api/locations').then((l) => {
      const mine = l.people.find((p) => p.person_id === user.person_id) ?? null;
      setCurrent(mine);
      setUntil(mine?.until ? mine.until.slice(0, 10) : '');
    });
  useEffect(() => void load(), []);

  const usePhone = () => {
    setMsg('');
    if (!navigator.geolocation) return setMsg('This phone cannot share its location.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const city = nearestCity(pos.coords.latitude, pos.coords.longitude);
        setPick({ city, source: 'phone', lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude) });
      },
      () => setMsg('Location permission was not given.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const save = async () => {
    if (!pick) return;
    try {
      await api.put('/api/location', {
        place_label: pick.city.name, country_code: pick.city.cc, tz: pick.city.tz, lat: pick.lat, lon: pick.lon, source: pick.source,
        ...(until ? { until: new Date(`${until}T12:00:00`).toISOString() } : {}),
      });
      setPick(null);
      setQ('');
      setMsg('Saved. Jonatito sees your pin there.');
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not save');
    }
  };

  const stop = async () => {
    await api.del('/api/location');
    setMsg('You are no longer on his globe.');
    await load();
  };

  const results = searchCities(q);

  return (
    <section className="where-i-am" data-testid="where-i-am">
      <h3>📍 Where I am</h3>
      <p className="muted" data-testid="where-current">
        {current
          ? `${flagOf(current.country_code)} ${current.place_label}${current.until ? ` · back ${new Date(current.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
          : 'Not shared. Jonatito sees a ❔ for you.'}
      </p>
      <div className="where-row">
        <input value={q} placeholder="Type a city…" data-testid="where-search" onChange={(e) => setQ(e.target.value)} />
        <button className="btn" data-testid="where-phone" onClick={usePhone}>📍 Use my phone</button>
      </div>
      {results.length > 0 && !pick && (
        <div className="where-results">
          {results.map((c) => (
            <button key={`${c.name}-${c.cc}`} className="btn" data-testid={`where-pick-${c.name}`} onClick={() => setPick({ city: c, source: 'manual', lat: c.lat, lon: c.lon })}>
              {flagOf(c.cc)} {c.name}
            </button>
          ))}
        </div>
      )}
      {pick && (
        <div className="where-pick">
          <b data-testid="where-picked">{flagOf(pick.city.cc)} {pick.city.name}</b>
          <label>
            Back home on (optional)
            <input type="date" value={until} data-testid="where-until" onChange={(e) => setUntil(e.target.value)} />
          </label>
          <button className="save" data-testid="where-save" onClick={save}>Save</button>
        </div>
      )}
      {current && <button className="link" data-testid="where-off" onClick={stop}>Stop sharing</button>}
      {msg && <p className="muted" data-testid="where-msg">{msg}</p>}
    </section>
  );
}
