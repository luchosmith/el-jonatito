// Messages from Jonatito, replies from the family, and voice notes both ways.
import path from 'node:path';
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { dispatch } from '../dispatcher.ts';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile } from '../http.ts';
import { audioUrl, childUserIds, getMessage, getReply, inboxFor, sentBy } from '../repo.ts';
import { AUDIO_MIME, saveAudio } from '../uploads.ts';
import { num, obj, oneOf, str } from '../validate.ts';
import type { Token, TokenKind } from '../../shared/types.ts';

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

  const deliver = (messageId: number, recipients: number[]) => {
    const message = getMessage(db, messageId)!;
    hub.publish([...recipients, message.from_user_id], { type: 'message', message });
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
    const kind = oneOf(body, 'kind', ['yes', 'wait', 'no', 'coming'] as const)!;
    const eta = num(body, 'eta_minutes', { optional: true, min: 1, max: 240 });
    const etaAt = eta ? new Date(now().getTime() + eta * 60_000).toISOString() : null;
    const r = db.run('INSERT INTO replies(message_id, from_user_id, kind, eta_at, created_at) VALUES(?,?,?,?,?)',
      id, ctx.user!.id, kind, etaAt, now().toISOString());
    return publishReply(r.lastId, id);
  });

  router.post('/api/messages/:id/replies/voice', requireAuth('caretaker', 'friend'), rawBody(AUDIO_MIME, MAX_AUDIO), (ctx) => {
    const id = Number(ctx.params.id);
    if (!getMessage(db, id)) throw new HttpError(404, 'Unknown message');
    if (!isRecipient(id, ctx.user!.id)) throw new HttpError(403, 'This message was not sent to you');
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    const r = db.run("INSERT INTO replies(message_id, from_user_id, kind, audio_file, created_at) VALUES(?,?,'voice',?,?)",
      id, ctx.user!.id, file, now().toISOString());
    return publishReply(r.lastId, id);
  });

  /** LISTEN (sound wave on a face): that person's last recorded message for Jonatito, if any. */
  router.get('/api/people/:id/voice', requireAuth(), (ctx) => {
    const r = db.get<{ audio_file: string; created_at: string }>(
      `SELECT r.audio_file, r.created_at FROM replies r JOIN users u ON u.id = r.from_user_id
       WHERE u.person_id = ? AND r.audio_file IS NOT NULL ORDER BY r.id DESC LIMIT 1`,
      ctx.params.id,
    );
    if (!r) return { url: null };
    return { url: audioUrl(r.audio_file), created_at: r.created_at };
  });

  router.get('/api/audio/:file', requireAuth(), (ctx) => {
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'audio'), ctx.params.file), 'private, max-age=86400');
  });
}
