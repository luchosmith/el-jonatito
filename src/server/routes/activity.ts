// The tap log, the caretakers' 🕒 Today timeline, the tablet's scrubbable timeline, the calendar,
// and notification settings.
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { HttpError, jsonBody, rawBody, type Ctx } from '../http.ts';
import { closeMoment, listMoments, recordTaps, TAP_ACTIONS } from '../moments.ts';
import { prefsFor } from '../notify.ts';
import { audioUrl, audit, childUserIds, getMessage, getReply, imageUrl } from '../repo.ts';
import { IMAGE_MIME, saveImage } from '../uploads.ts';
import { bool, num, obj, oneOf, str } from '../validate.ts';
import { startOfDay } from '../../shared/time.ts';
import type { CalendarEvent, TapInput, TimelineEntry, Token } from '../../shared/types.ts';

const MAX_PHOTO = 8 * 1024 * 1024;
const DAY = 86_400_000;

interface EventRow { id: number; starts_at: string; ends_at: string | null; title: string; emoji: string | null; kind: 'event' | 'photo'; person_ids: string; show_from_min: number; hidden: number; created_by: number | null; photo: string | null; by: string | null }

export function activityRoutes({ router, db, cfg, hub, now }: Deps) {
  const caretakers = () => db.all<{ id: number }>("SELECT id FROM users WHERE role = 'caretaker'").map((r) => r.id);
  const everyoneWatching = () => [...childUserIds(db), ...caretakers()];

  // ---- Tap log --------------------------------------------------------------------------------
  router.post('/api/taps', requireAuth('child'), jsonBody, (ctx) => {
    if (!Array.isArray(ctx.body) || ctx.body.length > 50) throw new HttpError(400, 'Send 1 to 50 taps');
    const t = now().getTime();
    const taps: TapInput[] = ctx.body.map((raw) => {
      const o = obj(raw);
      const at = new Date(str(o, 'at', { max: 40 })!);
      if (Number.isNaN(at.getTime())) throw new HttpError(400, 'at is not a date');
      // The tablet's clock may drift; keep taps within the last day and not in the future.
      const clamped = new Date(Math.min(t, Math.max(t - DAY, at.getTime())));
      const item = str(o, 'item_id', { optional: true, max: 60 }) ?? null;
      const person = str(o, 'person_id', { optional: true, max: 60 }) ?? null;
      if (item && !db.get('SELECT 1 FROM items WHERE id = ?', item)) throw new HttpError(400, `Unknown item ${item}`);
      if (person && !db.get('SELECT 1 FROM people WHERE id = ?', person)) throw new HttpError(400, `Unknown person ${person}`);
      const detail = o.detail === undefined || o.detail === null ? null : obj(o.detail);
      if (detail && JSON.stringify(detail).length > 500) throw new HttpError(400, 'detail is too long');
      return { at: clamped.toISOString(), action: oneOf(o, 'action', TAP_ACTIONS)!, screen: str(o, 'screen', { max: 30 })!, item_id: item, person_id: person, detail };
    });
    if (taps.length) recordTaps(db, hub, now(), taps);
    return { ok: true, count: taps.length };
  });

  // ---- Caretakers: 🕒 Today -----------------------------------------------------------------------
  router.get('/api/moments', requireAuth('caretaker'), (ctx) => {
    const day = ctx.url.searchParams.get('day');
    const start = day ? new Date(`${day}T00:00:00`) : startOfDay(now());
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Bad day');
    return timeline(start.toISOString(), new Date(start.getTime() + DAY).toISOString(), 'caretaker');
  });

  /** Answer a moment (sent or not): unsent ones become a message first. His tablet shows the reply. */
  router.post('/api/moments/:id/answer', requireAuth('caretaker'), jsonBody, (ctx) => {
    const id = Number(ctx.params.id);
    const m = db.get<{ id: number; outcome: string; tokens: string; sentence_en: string | null; sentence_es: string | null; message_id: number | null; started_at: string }>(
      'SELECT * FROM moments WHERE id = ?', id,
    );
    if (!m) throw new HttpError(404, 'Unknown moment');
    const b = obj(ctx.body);
    const kind = oneOf(b, 'kind', ['yes', 'wait', 'no'] as const)!;
    const eta = kind === 'wait' ? num(b, 'eta_minutes', { optional: true, min: 1, max: 240 }) ?? 5 : null;
    if (m.outcome === 'open') closeMoment(db, hub, now(), id, 'not_sent');
    let messageId = m.message_id;
    if (!messageId) {
      const child = childUserIds(db)[0];
      if (!child) throw new HttpError(409, 'No child account');
      const tokens = JSON.parse(m.tokens) as Token[];
      const fresh = db.get<{ sentence_en: string | null; sentence_es: string | null }>('SELECT sentence_en, sentence_es FROM moments WHERE id = ?', id)!;
      const r = db.run(
        `INSERT INTO messages(from_user_id, to_person_id, tokens, sentence_en, sentence_es, priority, notes, created_at) VALUES(?,?,?,?,?,'normal','[]',?)`,
        child, ctx.user!.person_id, JSON.stringify(tokens), fresh.sentence_en ?? '💭', fresh.sentence_es ?? fresh.sentence_en ?? '💭', m.started_at,
      );
      messageId = r.lastId;
      db.run('INSERT INTO message_recipients(message_id, user_id, seen_at) VALUES(?,?,?)', messageId, ctx.user!.id, now().toISOString());
    } else if (!db.get('SELECT 1 FROM message_recipients WHERE message_id = ? AND user_id = ?', messageId, ctx.user!.id)) {
      db.run('INSERT INTO message_recipients(message_id, user_id, seen_at) VALUES(?,?,?)', messageId, ctx.user!.id, now().toISOString());
    }
    db.run('UPDATE moments SET message_id = ?, answered_by = ? WHERE id = ?', messageId, ctx.user!.id, id);
    const etaAt = eta ? new Date(now().getTime() + eta * 60_000).toISOString() : null;
    const rr = db.run('INSERT INTO replies(message_id, from_user_id, kind, eta_at, created_at) VALUES(?,?,?,?,?)', messageId, ctx.user!.id, kind, etaAt, now().toISOString());
    const reply = getReply(db, rr.lastId)!;
    hub.publish([...new Set([...childUserIds(db), ctx.user!.id])], { type: 'reply', reply, message_id: messageId });
    hub.publish(caretakers(), { type: 'timeline' });
    return { message: getMessage(db, messageId), reply };
  });

  // ---- The tablet's timeline (past from what happened, future from the calendar) ------------------
  router.get('/api/timeline', requireAuth('child', 'caretaker'), (ctx) => {
    const t = now().getTime();
    const from = ctx.url.searchParams.get('from') ? new Date(ctx.url.searchParams.get('from')!) : new Date(t - 3 * DAY);
    const to = ctx.url.searchParams.get('to') ? new Date(ctx.url.searchParams.get('to')!) : new Date(t + 7 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new HttpError(400, 'Bad range');
    if (to.getTime() - from.getTime() > 12 * DAY) throw new HttpError(400, 'Range too long');
    return timeline(from.toISOString(), to.toISOString(), ctx.user!.role === 'child' ? 'child' : 'caretaker');
  });

  function toEvent(r: EventRow): CalendarEvent {
    return {
      id: r.id, starts_at: r.starts_at, ends_at: r.ends_at, title: r.title, emoji: r.emoji, kind: r.kind, person_ids: JSON.parse(r.person_ids) as string[],
      show_from_min: r.show_from_min, photo_url: imageUrl(r.photo), created_by: r.by,
    };
  }
  const EVENT_SQL = `SELECT e.*,
      (SELECT file FROM images im WHERE im.owner_type='event' AND im.owner_id=CAST(e.id AS TEXT) AND im.is_active=1 ORDER BY im.id DESC LIMIT 1) AS photo,
      (SELECT COALESCE(i.short_label, u.username) FROM users u LEFT JOIN items i ON i.id = u.person_id WHERE u.id = e.created_by) AS by
    FROM events e`;

  function timeline(fromIso: string, toIso: string, who: 'child' | 'caretaker'): TimelineEntry[] {
    const nowIso = now().toISOString();
    const out: TimelineEntry[] = [];
    for (const m of listMoments(db, fromIso, toIso)) {
      if (who === 'child' && m.outcome !== 'sent') continue; // his own timeline shows what he said
      out.push({ kind: 'moment', at: m.started_at, moment: m });
    }
    for (const p of db.all<{ at: string; body_part: string; level: number; message_id: number | null }>(
      'SELECT at, body_part, level, message_id FROM pain_reports WHERE at >= ? AND at < ?', fromIso, toIso,
    )) out.push({ kind: 'pain', at: p.at, part: p.body_part, level: p.level, message_id: p.message_id });
    // Caretakers see when he heard a voice note; his own timeline shows when it reached him.
    const voiceAt = who === 'child' ? 'created_at' : 'heard_at';
    for (const v of db.all<{ id: number; at: string; person_id: string | null; audio_file: string }>(
      `SELECT v.id, v.${voiceAt} AS at, u.person_id, v.audio_file FROM voice_notes v JOIN users u ON u.id = v.from_user_id WHERE v.hidden = 0 AND v.${voiceAt} >= ? AND v.${voiceAt} < ?`,
      fromIso, toIso,
    )) out.push({ kind: 'voice', at: v.at, person_id: v.person_id, note_id: v.id, audio_url: audioUrl(v.audio_file)! });
    if (who === 'child') {
      // Answers to what he sent (voice answers are voice notes, above).
      for (const r of db.all<{ created_at: string; person_id: string | null; kind: 'yes' | 'wait' | 'no' | 'coming' | 'text'; text: string | null }>(
        `SELECT r.created_at, u.person_id, r.kind, r.text FROM replies r JOIN users u ON u.id = r.from_user_id JOIN messages m ON m.id = r.message_id
         JOIN users mu ON mu.id = m.from_user_id WHERE mu.role = 'child' AND r.kind != 'voice' AND r.created_at >= ? AND r.created_at < ?`, fromIso, toIso,
      )) out.push({ kind: 'reply', at: r.created_at, person_id: r.person_id, reply: r.kind, text: r.text });
    }
    for (const s of db.all<{ started_at: string; title: string; emoji: string | null; cover: string | null }>(
      `SELECT ms.started_at, m.title, m.emoji,
         (SELECT file FROM images im WHERE im.owner_type='media' AND im.owner_id=CAST(m.id AS TEXT) AND im.is_active=1 ORDER BY im.id DESC LIMIT 1) AS cover
       FROM media_sessions ms JOIN media m ON m.id = ms.media_id WHERE ms.started_at >= ? AND ms.started_at < ?`, fromIso, toIso,
    )) out.push({ kind: 'media', at: s.started_at, title: s.title, emoji: s.emoji, cover_url: imageUrl(s.cover) });
    {
      // Caretakers see everything logged; his timeline shows what he ate and drank.
      for (const l of db.all<{ at: string; type: string; label: string | null; emoji: string | null; amount: number | null; note: string | null; by: string; symbol_id: string | null; photo: string | null }>(
        `SELECT l.at, l.type, i.label_en AS label, i.emoji, l.amount, l.note, COALESCE(pi.short_label, u.username) AS by, l.symbol_id,
           (SELECT file FROM images im WHERE im.owner_type = 'item' AND im.owner_id = l.symbol_id AND im.is_active = 1 ORDER BY im.id DESC LIMIT 1) AS photo
         FROM log_entries l JOIN users u ON u.id = l.entered_by LEFT JOIN items i ON i.id = l.symbol_id LEFT JOIN items pi ON pi.id = u.person_id
         WHERE l.at >= ? AND l.at < ? AND u.role = 'caretaker' ${who === 'child' ? "AND l.type IN ('food','drink')" : ''}`, fromIso, toIso,
      )) out.push({ kind: 'log', at: l.at, type: l.type, label: l.label ?? l.note ?? l.type, emoji: l.emoji, amount: l.amount, by: l.by, symbol_id: l.symbol_id, photo_url: imageUrl(l.photo) });
    }
    // A block counts while any of it is in the range (it may have started before).
    for (const e of db.all<EventRow>(`${EVENT_SQL} WHERE e.hidden = 0 AND e.starts_at < ? AND COALESCE(e.ends_at, e.starts_at) >= ?`, toIso, fromIso)) {
      const ev = toEvent(e);
      if (e.kind === 'photo') { if (e.starts_at <= nowIso) out.push({ kind: 'photo', at: e.starts_at, event: ev }); continue; }
      // Future events show once their "show from" time has come (caretakers always see them).
      const showFrom = new Date(new Date(e.starts_at).getTime() - e.show_from_min * 60_000).toISOString();
      if (who === 'caretaker' || showFrom <= nowIso) out.push({ kind: 'event', at: e.starts_at, event: ev });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }

  // ---- Calendar ------------------------------------------------------------------------------------
  const eventBody = (b: Record<string, unknown>, partial: boolean) => {
    const title = str(b, 'title', { optional: partial, max: 80 });
    const startsStr = str(b, 'starts_at', { optional: partial, max: 40 });
    const starts = startsStr ? new Date(startsStr) : undefined;
    if (starts && Number.isNaN(starts.getTime())) throw new HttpError(400, 'starts_at is not a date');
    const endsStr = b.ends_at === null ? null : str(b, 'ends_at', { optional: true, max: 40 });
    const ends = endsStr ? new Date(endsStr) : endsStr === null ? null : undefined;
    if (ends && Number.isNaN(ends.getTime())) throw new HttpError(400, 'ends_at is not a date');
    if (title !== undefined && !title.trim()) throw new HttpError(400, 'title is required');
    if (b.person_ids !== undefined && !Array.isArray(b.person_ids)) throw new HttpError(400, 'person_ids must be a list');
    const people = b.person_ids as unknown[] | undefined;
    for (const p of people ?? []) if (typeof p !== 'string' || !db.get('SELECT 1 FROM people WHERE id = ?', p)) throw new HttpError(400, 'Unknown person');
    return {
      title: title?.trim(), starts_at: starts?.toISOString(), ends_at: ends === undefined ? undefined : ends?.toISOString() ?? null, emoji: str(b, 'emoji', { optional: true, max: 16 }),
      kind: oneOf(b, 'kind', ['event', 'photo'] as const, true), person_ids: people as string[] | undefined,
      show_from_min: num(b, 'show_from_min', { optional: true, min: 0, max: 14 * 1440 }), hidden: bool(b, 'hidden'),
    };
  };
  /** A block ends after it starts and lasts at most two weeks. */
  const checkSpan = (starts: string, ends: string | null | undefined) => {
    if (!ends) return;
    const ms = new Date(ends).getTime() - new Date(starts).getTime();
    if (ms <= 0) throw new HttpError(400, 'ends_at must be after starts_at');
    if (ms > 14 * DAY) throw new HttpError(400, 'An event can last at most two weeks');
  };
  const getEvent = (id: number) => {
    const r = db.get<EventRow>(`${EVENT_SQL} WHERE e.id = ?`, id);
    if (!r) throw new HttpError(404, 'Unknown event');
    return toEvent(r);
  };
  const changed = (ctx: Ctx, action: string, id: number) => {
    audit(db, ctx.user!.id, action, String(id), now().toISOString());
    hub.publish(everyoneWatching(), { type: 'timeline' });
  };

  router.get('/api/calendar', requireAuth('caretaker'), () =>
    db.all<EventRow>(`${EVENT_SQL} WHERE e.starts_at >= ? ORDER BY e.starts_at`, new Date(now().getTime() - 3 * DAY).toISOString()).map(toEvent),
  );
  router.post('/api/calendar', requireAuth('caretaker'), jsonBody, (ctx) => {
    const e = eventBody(obj(ctx.body), false);
    checkSpan(e.starts_at!, e.ends_at);
    const r = db.run(
      'INSERT INTO events(starts_at, ends_at, title, emoji, kind, person_ids, show_from_min, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      e.starts_at!, e.ends_at ?? null, e.title!, e.emoji ?? null, e.kind ?? 'event', JSON.stringify(e.person_ids ?? []), e.show_from_min ?? 1440, ctx.user!.id, now().toISOString(),
    );
    changed(ctx, 'event.add', r.lastId);
    return getEvent(r.lastId);
  });
  router.patch('/api/calendar/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const id = Number(ctx.params.id);
    const cur = getEvent(id);
    const e = eventBody(obj(ctx.body), true);
    checkSpan(e.starts_at ?? cur.starts_at, e.ends_at === undefined ? cur.ends_at : e.ends_at);
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    const set = (c: string, v: string | number | null) => { sets.push(`${c} = ?`); vals.push(v); };
    if (e.title !== undefined) set('title', e.title);
    if (e.starts_at !== undefined) set('starts_at', e.starts_at);
    if (e.ends_at !== undefined) set('ends_at', e.ends_at);
    if (e.emoji !== undefined) set('emoji', e.emoji);
    if (e.kind !== undefined) set('kind', e.kind);
    if (e.person_ids !== undefined) set('person_ids', JSON.stringify(e.person_ids));
    if (e.show_from_min !== undefined) set('show_from_min', e.show_from_min);
    if (e.hidden !== undefined) set('hidden', e.hidden ? 1 : 0);
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    db.run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
    changed(ctx, 'event.update', id);
    return getEvent(id);
  });
  router.delete('/api/calendar/:id', requireAuth('caretaker'), (ctx) => {
    const id = Number(ctx.params.id);
    getEvent(id);
    db.run("DELETE FROM images WHERE owner_type = 'event' AND owner_id = ?", String(id));
    db.run('DELETE FROM events WHERE id = ?', id);
    changed(ctx, 'event.delete', id);
    return { ok: true };
  });
  router.put('/api/calendar/:id/image', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    const id = Number(ctx.params.id);
    getEvent(id);
    const file = saveImage(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run("INSERT INTO images(owner_type, owner_id, file, is_active, uploaded_by, created_at) VALUES('event',?,?,1,?,?)", String(id), file, ctx.user!.id, now().toISOString());
    changed(ctx, 'event.photo', id);
    return getEvent(id);
  });

  // ---- Notification settings --------------------------------------------------------------------
  router.get('/api/notify-prefs', requireAuth('caretaker', 'friend'), (ctx) => prefsFor(db, ctx.user!.id));
  router.put('/api/notify-prefs', requireAuth('caretaker', 'friend'), jsonBody, (ctx) => {
    const b = obj(ctx.body);
    const cur = prefsFor(db, ctx.user!.id);
    const batch = num(b, 'batch_min', { optional: true, min: 0, max: 60 }) ?? cur.batch_min;
    if (![0, 5, 10, 30].includes(batch)) throw new HttpError(400, 'batch_min must be 0, 5, 10 or 30');
    const face = bool(b, 'face_taps') ?? cur.face_taps;
    db.run(
      `INSERT INTO notify_prefs(user_id, batch_min, face_taps) VALUES(?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET batch_min = excluded.batch_min, face_taps = excluded.face_taps`,
      ctx.user!.id, batch, face ? 1 : 0,
    );
    return prefsFor(db, ctx.user!.id);
  });
}
