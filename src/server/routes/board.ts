// The item catalog (people, pets, words, media, body parts): pictures, sounds, placement and time rules.
import path from 'node:path';
import type { Deps } from '../app.ts';
import { requireAuth } from '../auth.ts';
import { HttpError, jsonBody, rawBody, safeJoin, sendFile, type Ctx } from '../http.ts';
import { audit, getItem, getPerson, itemImages, listItems, listPeople, listRules, listSymbols } from '../repo.ts';
import { AUDIO_MIME, IMAGE_MIME, saveAudio, saveImage } from '../uploads.ts';
import { bool, num, obj, oneOf, str } from '../validate.ts';
import type { ItemCategory, TapAction } from '../../shared/types.ts';

const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_WORD_AUDIO = 2 * 1024 * 1024;
const CATEGORIES: ItemCategory[] = ['person', 'pet', 'food', 'drink', 'action', 'place', 'feeling', 'play', 'media', 'body', 'social', 'urgent', 'core'];
const TAPS: TapAction[] = ['add', 'open', 'play', 'body', 'none'];
export const INNER_SLOTS = 8;
export const OUTER_SLOTS = 10;
/** 12:00 crowds the inner orbit on a landscape screen; 6:00 is where his ground pin sits. */
export const RESERVED_OUTER = [0, 5];

const nonEmpty = (v: string, key: string) => {
  const t = v.trim();
  if (!t) throw new HttpError(400, `${key} is required`);
  return t;
};

export function boardRoutes({ router, db, cfg, hub, now }: Deps) {
  const changed = (ctx: Ctx, action: string, target: string) => {
    audit(db, ctx.user!.id, action, target, now().toISOString());
    hub.publish('all', { type: 'items' });
  };
  const mustItem = (id: string) => {
    if (!db.get('SELECT 1 FROM items WHERE id = ?', id)) throw new HttpError(404, 'Unknown item');
  };

  router.get('/api/board', requireAuth(), () => ({
    people: listPeople(db),
    symbols: listSymbols(db),
    pages: db.setting('pages', []),
    dock: db.setting<string[]>('dock_items', []),
    items: listItems(db, now()),
  }));

  router.get('/api/items', requireAuth(), () => listItems(db, now()));

  router.get('/api/items/:id', requireAuth(), (ctx) => {
    const item = getItem(db, ctx.params.id, now());
    if (!item) throw new HttpError(404, 'Unknown item');
    return { ...item, images: itemImages(db, item.id) };
  });

  // ---- Words, kind, tap behaviour, placement ----------------------------------------------------
  router.patch('/api/items/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const id = ctx.params.id;
    mustItem(id);
    const body = obj(ctx.body);
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    const set = (col: string, v: string | number | null) => {
      sets.push(`${col} = ?`);
      vals.push(v);
    };
    const en = str(body, 'label_en', { optional: true, max: 60 });
    const es = str(body, 'label_es', { optional: true, max: 60 });
    const short = body.short_label === null ? null : str(body, 'short_label', { optional: true, max: 30 });
    const emoji = str(body, 'emoji', { optional: true, max: 16 });
    const category = oneOf(body, 'category', CATEGORIES, true);
    const tap = oneOf(body, 'tap', TAPS, true);
    const hidden = bool(body, 'is_hidden');
    if (en !== undefined) set('label_en', nonEmpty(en, 'label_en'));
    if (es !== undefined) set('label_es', nonEmpty(es, 'label_es'));
    if (short !== undefined) set('short_label', short?.trim() || null);
    if (emoji !== undefined) set('emoji', emoji);
    if (category) set('category', category);
    if (tap) set('tap', tap);
    if (hidden !== undefined) set('is_hidden', hidden ? 1 : 0);

    // Placement: orbit + fixed slot (+ which sub-orbit). Slots are never recomputed.
    if ('orbit' in body) {
      const orbit = body.orbit === null ? null : oneOf(body, 'orbit', ['inner', 'outer'] as const)!;
      const parent = body.parent_id === null || body.parent_id === undefined ? null : str(body, 'parent_id', { max: 60 })!;
      let slot: number | null = null;
      if (orbit) {
        slot = num(body, 'orbit_slot', { min: 0, max: (orbit === 'inner' ? INNER_SLOTS : OUTER_SLOTS) - 1 })!;
        if (!Number.isInteger(slot)) throw new HttpError(400, 'orbit_slot must be a whole number');
        // People left the orbit (v0.8): they are in the taskbar and on the globe.
        if (orbit === 'outer') throw new HttpError(400, 'People are not placed in the orbit');
        if (parent) {
          if (parent === id) throw new HttpError(400, 'An item cannot be inside itself');
          const p = db.get<{ tap: string }>('SELECT tap FROM items WHERE id = ?', parent);
          if (!p) throw new HttpError(400, 'Unknown parent item');
          if (p.tap !== 'open') throw new HttpError(400, 'The parent item must open a sub-orbit');
        }
        const taken = db.get<{ id: string }>(
          "SELECT id FROM items WHERE COALESCE(parent_id, '') = ? AND orbit = ? AND orbit_slot = ? AND id <> ?", parent ?? '', orbit, slot, id,
        );
        if (taken) throw new HttpError(409, `That slot is taken by "${taken.id}"`, { taken_by: taken.id });
      }
      set('orbit', orbit);
      set('orbit_slot', slot);
      set('parent_id', orbit ? parent : null);
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to change');
    set('updated_at', now().toISOString());
    set('updated_by', ctx.user!.id);
    db.run(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
    changed(ctx, 'orbit' in body ? 'item.move' : 'item.update', id);
    return getItem(db, id, now());
  });

  // ---- Pictures (with history and one-tap revert) -------------------------------------------------
  const addImage = (ctx: Ctx, id: string) => {
    mustItem(id);
    const file = saveImage(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run("INSERT INTO images(owner_type, owner_id, file, is_active, uploaded_by, created_at) VALUES('item',?,?,1,?,?)", id, file, ctx.user!.id, now().toISOString());
    changed(ctx, 'item.photo', id);
  };
  const revertImage = (ctx: Ctx, id: string) => {
    const current = db.get<{ id: number }>("SELECT id FROM images WHERE owner_type='item' AND owner_id=? AND is_active=1 ORDER BY id DESC LIMIT 1", id);
    if (!current) throw new HttpError(404, 'No picture to revert');
    db.run('UPDATE images SET is_active = 0 WHERE id = ?', current.id);
    changed(ctx, 'item.photo.revert', id);
  };
  router.put('/api/items/:id/image', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    addImage(ctx, ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });
  router.post('/api/items/:id/image/revert', requireAuth('caretaker'), (ctx) => {
    revertImage(ctx, ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });

  // ---- Recorded words (per language); none = text-to-speech ------------------------------------------
  const lang = (ctx: Ctx) => {
    const l = ctx.url.searchParams.get('lang');
    if (l !== 'en' && l !== 'es') throw new HttpError(400, 'lang must be en or es');
    return l;
  };
  router.put('/api/items/:id/audio', requireAuth('caretaker'), rawBody(AUDIO_MIME, MAX_WORD_AUDIO), (ctx) => {
    mustItem(ctx.params.id);
    const l = lang(ctx);
    const file = saveAudio(cfg.uploadsDir, ctx.raw!, ctx.req.headers['content-type']);
    db.run("INSERT INTO audio_clips(owner_type, owner_id, lang, file, is_active, uploaded_by, created_at) VALUES('item',?,?,?,1,?,?)",
      ctx.params.id, l, file, ctx.user!.id, now().toISOString());
    changed(ctx, 'item.audio', ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });
  router.delete('/api/items/:id/audio', requireAuth('caretaker'), (ctx) => {
    mustItem(ctx.params.id);
    db.run("UPDATE audio_clips SET is_active = 0 WHERE owner_type='item' AND owner_id = ? AND lang = ?", ctx.params.id, lang(ctx));
    changed(ctx, 'item.audio.tts', ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });

  // ---- Time rules -----------------------------------------------------------------------------------
  router.post('/api/items/:id/rules', requireAuth('caretaker'), jsonBody, (ctx) => {
    mustItem(ctx.params.id);
    const b = obj(ctx.body);
    const kind = oneOf(b, 'kind', ['window', 'limit', 'interval'] as const)!;
    const blocks = bool(b, 'blocks') ?? true;
    const minute = (k: string) => num(b, k, { optional: true, min: 0, max: 1439 }) ?? null;
    const days = num(b, 'days', { optional: true, min: 1, max: 127 }) ?? null;
    const suggest = str(b, 'suggest_item_id', { optional: true, max: 60 }) ?? null;
    if (suggest) mustItem(suggest);
    let start: number | null = null, end: number | null = null, routine: number | null = null, open: number | null = null;
    let max: number | null = null, interval: number | null = null;
    if (kind === 'window') {
      routine = num(b, 'routine_item_id', { optional: true, min: 1 }) ?? null;
      if (routine) {
        if (!db.get('SELECT 1 FROM schedule_items WHERE id = ?', routine)) throw new HttpError(400, 'Unknown routine item');
        open = num(b, 'routine_open_min', { min: 5, max: 600 })!;
      } else {
        start = minute('start_min');
        end = minute('end_min');
        if (start === null || end === null) throw new HttpError(400, 'A window needs start_min and end_min, or a routine item');
      }
    }
    if (kind === 'limit') max = num(b, 'max_per_day', { min: 1, max: 50 })!;
    if (kind === 'interval') interval = num(b, 'min_interval_min', { min: 5, max: 24 * 60 })!;
    db.run(
      `INSERT INTO item_rules(item_id, kind, blocks, days, start_min, end_min, routine_item_id, routine_open_min, max_per_day, min_interval_min, suggest_item_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ctx.params.id, kind, blocks ? 1 : 0, days, start, end, routine, open, max, interval, suggest,
    );
    changed(ctx, 'item.rule.add', ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });
  router.patch('/api/items/:id/rules/:rule', requireAuth('caretaker'), jsonBody, (ctx) => {
    const blocks = bool(obj(ctx.body), 'blocks');
    if (blocks === undefined) throw new HttpError(400, 'blocks is required');
    const r = db.run('UPDATE item_rules SET blocks = ? WHERE id = ? AND item_id = ?', blocks ? 1 : 0, Number(ctx.params.rule), ctx.params.id);
    if (!r.changes) throw new HttpError(404, 'Unknown rule');
    changed(ctx, 'item.rule.update', ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });
  router.delete('/api/items/:id/rules/:rule', requireAuth('caretaker'), (ctx) => {
    const r = db.run('DELETE FROM item_rules WHERE id = ? AND item_id = ?', Number(ctx.params.rule), ctx.params.id);
    if (!r.changes) throw new HttpError(404, 'Unknown rule');
    changed(ctx, 'item.rule.delete', ctx.params.id);
    return getItem(db, ctx.params.id, now());
  });
  router.get('/api/rules', requireAuth('caretaker'), () => listRules(db));

  // ---- Older endpoints (people / symbols), kept for the People and Words tabs ------------------------
  router.patch('/api/people/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const body = obj(ctx.body);
    const person = getPerson(db, ctx.params.id);
    if (!person) throw new HttpError(404, 'Unknown person');
    const label = str(body, 'short_label', { optional: true, max: 40 });
    const visible = bool(body, 'is_visible');
    if (label !== undefined) db.run('UPDATE items SET short_label = ?, label_en = ?, label_es = ? WHERE id = ?', label, label, label, person.id);
    if (visible !== undefined) db.run('UPDATE items SET is_hidden = ? WHERE id = ?', visible ? 0 : 1, person.id);
    changed(ctx, 'person.update', person.id);
    return getPerson(db, person.id);
  });
  router.put('/api/people/:id/photo', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    if (!getPerson(db, ctx.params.id)) throw new HttpError(404, 'Unknown person');
    addImage(ctx, ctx.params.id);
    return getPerson(db, ctx.params.id);
  });
  router.post('/api/people/:id/photo/revert', requireAuth('caretaker'), (ctx) => {
    revertImage(ctx, ctx.params.id);
    return getPerson(db, ctx.params.id);
  });
  router.patch('/api/symbols/:id', requireAuth('caretaker'), jsonBody, (ctx) => {
    const hidden = bool(obj(ctx.body), 'is_hidden');
    const r = db.run("UPDATE items SET is_hidden = ? WHERE id = ? AND category NOT IN ('person','pet')", hidden ? 1 : 0, ctx.params.id);
    if (!r.changes) throw new HttpError(404, 'Unknown symbol');
    changed(ctx, hidden ? 'symbol.hide' : 'symbol.show', ctx.params.id);
    return listSymbols(db).find((s) => s.id === ctx.params.id);
  });
  router.put('/api/symbols/:id/photo', requireAuth('caretaker'), rawBody(IMAGE_MIME, MAX_PHOTO), (ctx) => {
    addImage(ctx, ctx.params.id);
    return listSymbols(db).find((s) => s.id === ctx.params.id);
  });

  router.get('/api/images/:file', requireAuth(), (ctx) => {
    sendFile(ctx, safeJoin(path.join(cfg.uploadsDir, 'images'), ctx.params.file), 'private, max-age=31536000, immutable');
  });
}
