// People, pets, symbols and their pictures.
import path from 'node:path';
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile } from '../http.ts';
import { audit, getPerson, listPeople, listSymbols } from '../repo.ts';
import { IMAGE_MIME, saveImage } from '../uploads.ts';
import { bool, obj, str } from '../validate.ts';

const MAX_PHOTO = 8 * 1024 * 1024;

export function boardRoutes({ router, db, cfg, hub }: Deps) {
  router.get('/api/board', requireAuth(), () => ({
    people: listPeople(db),
    symbols: listSymbols(db),
    pages: db.setting('pages', []),
  }));

  router.patch('/api/people/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const person = getPerson(db, ctx.params.id);
    if (!person) throw new HttpError(404, 'Unknown person');
    const label = str(body, 'short_label', { optional: true, max: 40 });
    const visible = bool(body, 'is_visible');
    if (label !== undefined) db.run('UPDATE people SET short_label = ?, label_es = ? WHERE id = ?', label, label, person.id);
    if (visible !== undefined) db.run('UPDATE people SET is_visible = ? WHERE id = ?', visible ? 1 : 0, person.id);
    audit(db, ctx.user!.id, 'person.update', person.id, new Date().toISOString());
    hub.publish('all', { type: 'people' });
    return getPerson(db, person.id);
  });

  // Replace a picture with a real photo. Position, color and sound never change.
  router.put('/api/people/:id/photo', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    const person = getPerson(db, ctx.params.id);
    if (!person) throw new HttpError(404, 'Unknown person');
    const file = saveImage(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run('INSERT INTO images(owner_type, owner_id, file, is_active, uploaded_by, created_at) VALUES(?,?,?,1,?,?)',
      'person', person.id, file, ctx.user!.id, new Date().toISOString());
    audit(db, ctx.user!.id, 'person.photo', person.id, new Date().toISOString());
    hub.publish('all', { type: 'people' });
    return getPerson(db, person.id);
  });

  // One-tap revert to the previous picture.
  router.post('/api/people/:id/photo/revert', requireAuth('caretaker'), (ctx) => {
    const current = db.get<{ id: number }>(
      "SELECT id FROM images WHERE owner_type='person' AND owner_id=? AND is_active=1 ORDER BY id DESC LIMIT 1", ctx.params.id,
    );
    if (!current) throw new HttpError(404, 'No picture to revert');
    db.run('UPDATE images SET is_active = 0 WHERE id = ?', current.id);
    hub.publish('all', { type: 'people' });
    return getPerson(db, ctx.params.id);
  });

  router.patch('/api/symbols/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const hidden = bool(obj(ctx.body), 'is_hidden');
    const r = db.run('UPDATE symbols SET is_hidden = ? WHERE id = ?', hidden ? 1 : 0, ctx.params.id);
    if (!r.changes) throw new HttpError(404, 'Unknown symbol');
    audit(db, ctx.user!.id, hidden ? 'symbol.hide' : 'symbol.show', ctx.params.id, new Date().toISOString());
    hub.publish('all', { type: 'symbols' });
    return listSymbols(db).find((s) => s.id === ctx.params.id);
  });

  router.put('/api/symbols/:id/photo', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    if (!db.get('SELECT id FROM symbols WHERE id = ?', ctx.params.id)) throw new HttpError(404, 'Unknown symbol');
    const file = saveImage(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run('INSERT INTO images(owner_type, owner_id, file, is_active, uploaded_by, created_at) VALUES(?,?,?,1,?,?)',
      'symbol', ctx.params.id, file, ctx.user!.id, new Date().toISOString());
    hub.publish('all', { type: 'symbols' });
    return listSymbols(db).find((s) => s.id === ctx.params.id);
  });

  router.get('/api/images/:file', requireAuth(), (ctx) => {
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'images'), ctx.params.file), 'private, max-age=31536000, immutable');
  });
}
