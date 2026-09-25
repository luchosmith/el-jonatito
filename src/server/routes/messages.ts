// Messages from Jonatito, replies from the family, and voice notes both ways.
import path from 'node:path';
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { dispatch } from '../dispatcher.ts';
import { momentSent } from '../moments.ts';
import { enqueue } from '../notify.ts';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile } from '../http.ts';
import { childUserIds, getLog, getMessage, getReply, getVoiceNote, inboxFor, sentBy } from '../repo.ts';
import { AUDIO_MIME, saveAudio } from '../uploads.ts';
import { num, obj, oneOf, str } from '../validate.ts';
import { BODY_PARTS, bodyItemId, DEFAULT_PAIN_POLICY, painSentence, type PainPolicy } from '../../shared/body.ts';
import type { DispatchNote, LogEntry, Token, TokenKind } from '../../shared/types.ts';

const TOKEN_KINDS: TokenKind[] = ['person', 'pet', 'action', 'thing', 'desc', 'social', 'urgent'];
const MAX_AUDIO = 5 * 1024 * 1024;

function parseTokens(v: unknown): Token[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'tokens must be a list');
  return v.map((t) => {
    const o = obj(t);
    return { kind: oneOf(o, 'kind', TOKEN_KINDS)!, id: str(o, 'id', { max: 60 })! };
  });
}

export function messageRoutes({ router, db, cfg, hub, now }: Deps) {
  const isRecipient = (messageId: number, userId: number) =>
    !!db.get('SELECT 1 FROM message_recipients WHERE message_id = ? AND user_id = ?', messageId, userId);

  // The inbox updates live for everyone; the notification (banner / sound, later push) is batched per person.
  const deliver = (messageId: number, recipients: number[]) => {
    const message = getMessage(db, messageId)!;
    hub.publish([...recipients, message.from_user_id], { type: 'message', message });
    const summary = message.tokens.length || message.pain ? message.sentence_en : '🔊 voice message';
    for (const uid of recipients) {
      if (uid !== message.from_user_id) enqueue(db, hub, now(), uid, message.priority === 'urgent' ? 'urgent' : 'message', summary, { messageId });
    }
    momentSent(db, hub, now(), messageId);
    return message;
  };

  router.post('/api/messages', requireAuth('child'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const r = dispatch(db, now(), {
      fromUserId: ctx.user!.id,
      toPersonId: str(body, 'to_person_id', { optional: true, max: 60 }) ?? null,
      tokens: parseTokens(body.tokens),
    });
    return { message: deliver(r.messageId, r.recipients), notes: r.notes };
  });

  /** Voice message: Jonatito taps a person's ear (TALK) and his sounds go to them. */
  router.post('/api/messages/voice', requireAuth('child'), rawBody(AUDIO_MIME, MAX_AUDIO), (ctx) => {
    const to = ctx.url.searchParams.get('to');
    if (!to) throw new HttpError(400, 'to is required');
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const r = dispatch(db, now(), { fromUserId: ctx.user!.id, toPersonId: to, tokens: [], audioFile: file });
    return { message: deliver(r.messageId, r.recipients), notes: r.notes };
  });

  router.get('/api/messages', requireAuth(), (ctx) =>
    ctx.user!.role === 'child' ? sentBy(db, ctx.user!.id) : inboxFor(db, ctx.user!.id),
  );

  router.post('/api/messages/:id/seen', requireAuth('caretaker', 'friend'), (ctx) => {
    db.run('UPDATE message_recipients SET seen_at = ? WHERE message_id = ? AND user_id = ?', now().toISOString(), Number(ctx.params.id), ctx.user!.id);
    return { ok: true };
  });

  const publishReply = (replyId: number, messageId: number) => {
    const reply = getReply(db, replyId)!;
    const m = getMessage(db, messageId)!;
    hub.publish([...new Set([m.from_user_id, ...childUserIds(db), ...m.recipients])], { type: 'reply', reply, message_id: messageId });
    return reply;
  };

  router.post('/api/messages/:id/replies', requireAuth('caretaker', 'friend'), jsonBody, (ctx) => {
    const id = Number(ctx.params.id);
    if (!getMessage(db, id)) throw new HttpError(404, 'Unknown message');
    if (!isRecipient(id, ctx.user!.id)) throw new HttpError(403, 'This message was not sent to you');
    const body = obj(ctx.body);
    const kind = oneOf(body, 'kind', ['yes', 'wait', 'no', 'coming', 'text'] as const)!;
    const eta = num(body, 'eta_minutes', { optional: true, min: 1, max: 240 });
    const etaAt = eta ? new Date(now().getTime() + eta * 60_000).toISOString() : null;
    // A typed reply: short, read aloud on his tablet.
    const text = kind === 'text' ? str(body, 'text', { max: 120 })!.trim() : null;
    if (kind === 'text' && !text) throw new HttpError(400, 'text is required');
    const r = db.run('INSERT INTO replies(message_id, from_user_id, kind, eta_at, text, created_at) VALUES(?,?,?,?,?,?)',
      id, ctx.user!.id, kind, etaAt, text, now().toISOString());
    return publishReply(r.lastId, id);
  });

  router.post('/api/messages/:id/replies/voice', requireAuth('caretaker', 'friend'), rawBody(AUDIO_MIME, MAX_AUDIO), (ctx) => {
    const id = Number(ctx.params.id);
    if (!getMessage(db, id)) throw new HttpError(404, 'Unknown message');
    if (!isRecipient(id, ctx.user!.id)) throw new HttpError(403, 'This message was not sent to you');
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const r = db.run("INSERT INTO replies(message_id, from_user_id, kind, audio_file, created_at) VALUES(?,?,'voice',?,?)",
      id, ctx.user!.id, file, now().toISOString());
    // Everything he can hear lives on the voice shelf too.
    const v = db.run("INSERT INTO voice_notes(from_user_id, audio_file, created_at, source) VALUES(?,?,?,'reply')", ctx.user!.id, file, now().toISOString());
    hub.publish(childUserIds(db), { type: 'voice_note', note: getVoiceNote(db, v.lastId)! });
    return publishReply(r.lastId, id);
  });

  /** That person's newest voice note for Jonatito, if any. */
  router.get('/api/people/:id/voice', requireAuth(), (ctx) => {
    const r = db.get<{ id: number }>(
      `SELECT v.id FROM voice_notes v JOIN users u ON u.id = v.from_user_id
       WHERE u.person_id = ? AND v.hidden = 0 ORDER BY v.id DESC LIMIT 1`,
      ctx.params.id,
    );
    const note = r ? getVoiceNote(db, r.id) : undefined;
    return note ? { url: note.audio_url, created_at: note.created_at } : { url: null };
  });

  /** My body: where it hurts and how much. Low levels are only logged; high levels are urgent. */
  router.post('/api/pain', requireAuth('child'), jsonBody, (ctx) => {
    const b = obj(ctx.body);
    const partId = oneOf(b, 'part', BODY_PARTS.map((p) => p.id))!;
    const side = oneOf(b, 'side', ['left', 'right'] as const, true) ?? null;
    const level = num(b, 'level', { min: 0, max: 5 })!;
    if (!Number.isInteger(level)) throw new HttpError(400, 'level must be 0 to 5');
    const item = db.get<{ label_en: string; label_es: string; is_hidden: number }>('SELECT label_en, label_es, is_hidden FROM items WHERE id = ?', bodyItemId(partId));
    if (!item || item.is_hidden) throw new HttpError(400, 'That body part is not available');
    const plural = BODY_PARTS.find((p) => p.id === partId)!.plural;
    const part = { en: item.label_en, es: item.label_es, plural };
    const sentence = { en: painSentence(part, level, 'en'), es: painSentence(part, level, 'es') };
    const policy = db.setting<PainPolicy>('pain_policy', DEFAULT_PAIN_POLICY);
    const at = now().toISOString();

    let message = null;
    let notes: DispatchNote[] = [];
    if (level >= policy.notify_from) {
      const r = dispatch(db, now(), { fromUserId: ctx.user!.id, toPersonId: null, tokens: [], sentence, urgent: level >= policy.urgent_from });
      db.run('INSERT INTO pain_reports(body_part, side, level, at, message_id) VALUES(?,?,?,?,?)', partId, side, level, at, r.messageId);
      message = deliver(r.messageId, r.recipients);
      notes = r.notes;
    } else {
      db.run('INSERT INTO pain_reports(body_part, side, level, at) VALUES(?,?,?,?)', partId, side, level, at);
    }
    const log = db.run("INSERT INTO log_entries(type, symbol_id, amount, note, at, entered_by) VALUES('pain',?,?,?,?,?)",
      bodyItemId(partId), level / 5, sentence.en, at, ctx.user!.id);
    hub.publish('all', { type: 'log', entry: getLog(db, log.lastId) as LogEntry });
    return { sentence, level, message, notes };
  });

  router.get('/api/audio/:file', requireAuth(), (ctx) => {
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'audio'), ctx.params.file), 'private, max-age=86400');
  });
}
