// Voice notes for Jonatito ("a familiar voice") and where each adult is (city level).
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { HttpError, jsonBody, rawBody } from '../http.ts';
import { audit, childUserIds, getVoiceNote, homePlace, isWithJonatito, listLocations, listVoiceNotes, validTz } from '../repo.ts';
import { AUDIO_MIME, saveAudio } from '../uploads.ts';
import { isQuietHours } from '../notify.ts';
import { bool, num, obj, oneOf, str } from '../validate.ts';

const cleanLabel = (s: string | null | undefined) => {
  const t = (s ?? '').trim().slice(0, 60);
  return t || null;
};
import { coarse } from '../../shared/geo.ts';
import type { Locations, Place } from '../../shared/types.ts';

const MAX_NOTE = 8 * 1024 * 1024; // about a minute of Opus/AAC


export function voiceRoutes({ router, db, cfg, hub, now }: Deps) {
  const caretakerIds = () => db.all<{ id: number }>("SELECT id FROM users WHERE role = 'caretaker'").map((r) => r.id);

  // ---- Voice notes -----------------------------------------------------------------------------
  router.post('/api/voice-notes', requireAuth('caretaker', 'friend'), rawBody(AUDIO_MIME, MAX_NOTE), (ctx) => {
    const d = Number(ctx.url.searchParams.get('duration'));
    const duration = Number.isFinite(d) && d > 0 && d < 600 ? Math.round(d * 10) / 10 : null;
    const label = cleanLabel(ctx.url.searchParams.get('label'));
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const r = db.run("INSERT INTO voice_notes(from_user_id, audio_file, duration_s, created_at, source, label) VALUES(?,?,?,?,'app',?)",
      ctx.user!.id, file, duration, now().toISOString(), label);
    return announce(r.lastId, ctx.user!.id);
  });

  /** A new note reaches the tablet (and plays once there, outside quiet hours). */
  const announce = (noteId: number, senderId: number) => {
    const note = getVoiceNote(db, noteId)!;
    const autoplay = !isQuietHours(db, now());
    hub.publish([...new Set([...childUserIds(db), ...caretakerIds(), senderId])], { type: 'voice_note', note, autoplay });
    return { ...note, autoplay };
  };

  /** Send one of your saved clips again, as a new message (same sound file, no new recording). */
  router.post('/api/voice-notes/:id/resend', requireAuth('caretaker', 'friend'), (ctx) => {
    const src = db.get<{ from_user_id: number; audio_file: string; duration_s: number | null; label: string | null }>(
      'SELECT from_user_id, audio_file, duration_s, label FROM voice_notes WHERE id = ?', Number(ctx.params.id),
    );
    if (!src) throw new HttpError(404, 'Unknown voice note');
    if (src.from_user_id !== ctx.user!.id) throw new HttpError(403, 'You can only send your own clips');
    const r = db.run("INSERT INTO voice_notes(from_user_id, audio_file, duration_s, created_at, source, label) VALUES(?,?,?,?,'app',?)",
      ctx.user!.id, src.audio_file, src.duration_s, now().toISOString(), src.label);
    return announce(r.lastId, ctx.user!.id);
  });

  /** Your saved clips: one per recording (resends share the sound), labeled first, then newest. */
  router.get('/api/voice-notes/mine', requireAuth('caretaker', 'friend'), (ctx) => {
    const rows = db.all<{ id: number }>(
      `SELECT MAX(id) AS id FROM voice_notes WHERE from_user_id = ? GROUP BY audio_file
       ORDER BY MAX(label IS NOT NULL) DESC, MAX(created_at) DESC LIMIT 30`,
      ctx.user!.id,
    );
    return rows.map((r) => getVoiceNote(db, r.id)!);
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

  /** Caretakers pin comfort clips (first on the shelf, never expire) or hide a note; the sender can label it. */
  router.patch('/api/voice-notes/:id', requireAuth('caretaker', 'friend'), jsonBody, (ctx) => {
    const id = Number(ctx.params.id);
    const current = getVoiceNote(db, id);
    if (!current) throw new HttpError(404, 'Unknown voice note');
    const b = obj(ctx.body);
    const pinned = bool(b, 'pinned');
    const hidden = bool(b, 'hidden');
    const hasLabel = 'label' in b;
    if (pinned === undefined && hidden === undefined && !hasLabel) throw new HttpError(400, 'Nothing to change');
    if ((pinned !== undefined || hidden !== undefined) && ctx.user!.role !== 'caretaker') throw new HttpError(403, 'Only caretakers can pin or hide');
    if (hasLabel) {
      if (current.from_user_id !== ctx.user!.id) throw new HttpError(403, 'You can only label your own clips');
      const label = b.label === null ? null : cleanLabel(str(b, 'label', { max: 60 })!);
      // A label names the sound: every copy sent with the same file gets it.
      db.run('UPDATE voice_notes SET label = ? WHERE from_user_id = ? AND audio_file = (SELECT audio_file FROM voice_notes WHERE id = ?)', label, ctx.user!.id, id);
    }
    if (pinned !== undefined) db.run('UPDATE voice_notes SET pinned = ? WHERE id = ?', pinned ? 1 : 0, id);
    if (hidden !== undefined) db.run('UPDATE voice_notes SET hidden = ? WHERE id = ?', hidden ? 1 : 0, id);
    audit(db, ctx.user!.id, 'voice.update', String(id), now().toISOString());
    const note = getVoiceNote(db, id)!;
    hub.publish([...childUserIds(db), ...caretakerIds(), note.from_user_id], { type: 'voice_note', note });
    return note;
  });

  // ---- Where everyone is ------------------------------------------------------------------------
  const home = (): Place => homePlace(db, cfg);
  /** Leaving home ends on duty (you can only be on duty when you are with him). */
  const checkDuty = (userId: number, personId: string | null) => {
    const a = db.get<{ status: string }>('SELECT status FROM availability WHERE user_id = ?', userId);
    if (a?.status !== 'on_duty' || isWithJonatito(db, cfg, userId, now())) return;
    db.run("UPDATE availability SET status = 'available', until = NULL, updated_at = ? WHERE user_id = ?", now().toISOString(), userId);
    if (personId) hub.publish('all', { type: 'availability', person_id: personId, status: 'available', until: null });
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
    checkDuty(ctx.user!.id, ctx.user!.person_id);
    return listLocations(db, now()).find((l) => l.person_id === ctx.user!.person_id) ?? null;
  });

  /** Stop sharing. */
  router.delete('/api/location', requireAuth('caretaker', 'friend'), (ctx) => {
    db.run('DELETE FROM locations WHERE user_id = ?', ctx.user!.id);
    if (ctx.user!.person_id) hub.publish([...childUserIds(db), ...caretakerIds()], { type: 'location', person_id: ctx.user!.person_id });
    checkDuty(ctx.user!.id, ctx.user!.person_id);
    return { ok: true };
  });
}
