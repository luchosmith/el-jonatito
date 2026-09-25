// Voice notes for Jonatito ("a familiar voice") and where each adult is (city level).
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { HttpError, jsonBody, rawBody } from '../http.ts';
import { audit, childUserIds, getVoiceNote, listLocations, listVoiceNotes } from '../repo.ts';
import { AUDIO_MIME, saveAudio } from '../uploads.ts';
import { bool, num, obj, oneOf, str } from '../validate.ts';
import { coarse, nearestCity } from '../../shared/geo.ts';
import type { Locations, Place } from '../../shared/types.ts';

const MAX_NOTE = 8 * 1024 * 1024; // about a minute of Opus/AAC

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function voiceRoutes({ router, db, cfg, hub, now }: Deps) {
  const caretakerIds = () => db.all<{ id: number }>("SELECT id FROM users WHERE role = 'caretaker'").map((r) => r.id);

  // ---- Voice notes -----------------------------------------------------------------------------
  router.post('/api/voice-notes', requireAuth('caretaker', 'friend'), rawBody(AUDIO_MIME, MAX_NOTE), (ctx) => {
    const d = Number(ctx.url.searchParams.get('duration'));
    const duration = Number.isFinite(d) && d > 0 && d < 600 ? Math.round(d * 10) / 10 : null;
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const r = db.run("INSERT INTO voice_notes(from_user_id, audio_file, duration_s, created_at, source) VALUES(?,?,?,?,'app')",
      ctx.user!.id, file, duration, now().toISOString());
    const note = getVoiceNote(db, r.lastId)!;
    hub.publish([...new Set([...childUserIds(db), ...caretakerIds(), ctx.user!.id])], { type: 'voice_note', note });
    return note;
  });

  /** The tablet and caretakers see every note; a friend only their own. */
  router.get('/api/voice-notes', requireAuth(), (ctx) => {
    const u = ctx.user!;
    if (u.role === 'friend') return listVoiceNotes(db, now(), { fromUserId: u.id, includeHidden: true });
    return listVoiceNotes(db, now(), { includeHidden: u.role === 'caretaker' && ctx.url.searchParams.get('all') === '1' });
  });

  router.post('/api/voice-notes/:id/heard', requireAuth('child'), (ctx) => {
    const id = Number(ctx.params.id);
    if (!getVoiceNote(db, id)) throw new HttpError(404, 'Unknown voice note');
    db.run('UPDATE voice_notes SET heard_at = COALESCE(heard_at, ?) WHERE id = ?', now().toISOString(), id);
    const note = getVoiceNote(db, id)!;
    hub.publish([...childUserIds(db), ...caretakerIds(), note.from_user_id], { type: 'voice_note', note });
    return note;
  });

  /** Caretakers pin comfort clips (first on the shelf, never expire) or hide a note. */
  router.patch('/api/voice-notes/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const id = Number(ctx.params.id);
    if (!getVoiceNote(db, id)) throw new HttpError(404, 'Unknown voice note');
    const b = obj(ctx.body);
    const pinned = bool(b, 'pinned');
    const hidden = bool(b, 'hidden');
    if (pinned === undefined && hidden === undefined) throw new HttpError(400, 'Nothing to change');
    if (pinned !== undefined) db.run('UPDATE voice_notes SET pinned = ? WHERE id = ?', pinned ? 1 : 0, id);
    if (hidden !== undefined) db.run('UPDATE voice_notes SET hidden = ? WHERE id = ?', hidden ? 1 : 0, id);
    audit(db, ctx.user!.id, 'voice.update', String(id), now().toISOString());
    const note = getVoiceNote(db, id)!;
    hub.publish([...childUserIds(db), ...caretakerIds(), note.from_user_id], { type: 'voice_note', note });
    return note;
  });

  // ---- Where everyone is ------------------------------------------------------------------------
  const home = (): Place => {
    const saved = db.setting<Place | null>('home_location', null);
    if (saved) return saved;
    const city = nearestCity(cfg.lat, cfg.lon);
    const tz = process.env.TZ && validTz(process.env.TZ) ? process.env.TZ : Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { place_label: cfg.placeName, country_code: city.cc, tz, lat: coarse(cfg.lat), lon: coarse(cfg.lon) };
  };

  router.get('/api/locations', requireAuth(), (ctx): Locations => {
    const all = listLocations(db, now());
    const u = ctx.user!;
    return { home: home(), people: u.role === 'friend' ? all.filter((l) => l.person_id === u.person_id) : all };
  });

  router.put('/api/location', requireAuth('caretaker', 'friend'), jsonBody, (ctx) => {
    const b = obj(ctx.body);
    const place = str(b, 'place_label', { max: 60 })!.trim();
    const cc = str(b, 'country_code', { pattern: /^[A-Za-z]{2}$/ })!.toUpperCase();
    const tz = str(b, 'tz', { max: 60 })!;
    if (!place) throw new HttpError(400, 'place_label is required');
    if (!validTz(tz)) throw new HttpError(400, 'Unknown time zone');
    const lat = num(b, 'lat', { min: -90, max: 90 })!;
    const lon = num(b, 'lon', { min: -180, max: 180 })!;
    const source = oneOf(b, 'source', ['manual', 'phone'] as const, true) ?? 'manual';
    const untilStr = str(b, 'until', { optional: true, max: 40 });
    const until = untilStr ? new Date(untilStr) : null;
    if (until && Number.isNaN(until.getTime())) throw new HttpError(400, 'until is not a date');
    db.run(
      `INSERT INTO locations(user_id, place_label, country_code, tz, lat, lon, source, until, updated_at) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET place_label = excluded.place_label, country_code = excluded.country_code, tz = excluded.tz,
         lat = excluded.lat, lon = excluded.lon, source = excluded.source, until = excluded.until, updated_at = excluded.updated_at`,
      ctx.user!.id, place, cc, tz, coarse(lat), coarse(lon), source, until?.toISOString() ?? null, now().toISOString(),
    );
    if (ctx.user!.person_id) hub.publish([...childUserIds(db), ...caretakerIds()], { type: 'location', person_id: ctx.user!.person_id });
    return listLocations(db, now()).find((l) => l.person_id === ctx.user!.person_id) ?? null;
  });

  /** Stop sharing. */
  router.delete('/api/location', requireAuth('caretaker', 'friend'), (ctx) => {
    db.run('DELETE FROM locations WHERE user_id = ?', ctx.user!.id);
    if (ctx.user!.person_id) hub.publish([...childUserIds(db), ...caretakerIds()], { type: 'location', person_id: ctx.user!.person_id });
    return { ok: true };
  });
}
