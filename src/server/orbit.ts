// The orbit layout and starter rules from seed/orbit.json. Used by a fresh seed and by the
// v2 -> v3 migration, so both end up with the same fixed slots.
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import type { Config } from './config.ts';
import { BODY_PARTS, bodyItemId } from '../shared/body.ts';

interface OrbitSeed {
  inner: { id: string; slot: number; tap?: string; short_label?: string; emoji?: string; media?: string }[];
  /** things in the dock after the family, left to right (not in an orbit) */
  dock?: { id: string; tap?: string; media?: string }[];
  /** position in the list = fixed slot; null keeps a slot empty (nothing shifts) */
  sub_orbits: Record<string, (string | null)[]>;
  rules: { item: string; kind: 'window'; routine?: string; open_min?: number; start?: string; end?: string; blocks: boolean }[];
  pain_policy: { notify_from: number; urgent_from: number };
  voice_retention_days: number;
}

interface MediaSeed { title: string; kind: string; emoji?: string; cover?: string; bedtime_ok?: boolean }

/** Board page -> item category. */
export const PAGE_CATEGORY: Record<string, string> = {
  food: 'food', drink: 'drink', action: 'action', place: 'place', feel: 'feeling', play: 'play', core: 'core', face: 'social',
};

/** Daily limits become item rules: a daily maximum closes the item, a minimum interval only reminds. */
export function insertLimitRules(db: Db, itemId: string, limit: { max_per_day?: number | null; min_interval_min?: number | null; suggest?: string | null }) {
  if (limit.max_per_day) {
    db.run("INSERT INTO item_rules(item_id, kind, blocks, max_per_day, suggest_item_id) VALUES(?, 'limit', 1, ?, ?)", itemId, limit.max_per_day, limit.suggest ?? null);
  }
  if (limit.min_interval_min) {
    db.run("INSERT INTO item_rules(item_id, kind, blocks, min_interval_min, suggest_item_id) VALUES(?, 'interval', 0, ?, ?)", itemId, limit.min_interval_min, limit.suggest ?? null);
  }
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** Copies a seed picture into uploads and records it as the active image of `owner`. */
export function copySeedImage(db: Db, cfg: Config, rel: string, ownerType: 'item' | 'media', ownerId: string, now: string) {
  const src = path.join(cfg.seedDir, rel);
  if (!fs.existsSync(src)) return;
  const dir = path.join(cfg.uploadsDir, 'images');
  fs.mkdirSync(dir, { recursive: true });
  const file = `seed-${ownerType}-${ownerId}${path.extname(src)}`;
  fs.copyFileSync(src, path.join(dir, file));
  db.run('INSERT INTO images(owner_type, owner_id, file, is_active, created_at) VALUES(?,?,?,1,?)', ownerType, ownerId, file, now);
}

export function applyOrbitDefaults(db: Db, cfg: Config) {
  const seed = JSON.parse(fs.readFileSync(path.join(cfg.seedDir, 'orbit.json'), 'utf8')) as OrbitSeed;
  const media = (JSON.parse(fs.readFileSync(path.join(cfg.seedDir, 'media.json'), 'utf8')) as { items: MediaSeed[] }).items;
  const now = new Date().toISOString();
  const has = (id: string) => !!db.get('SELECT 1 FROM items WHERE id = ?', id);

  // Media that orbit items play (e.g. Pongo) must exist as media rows.
  const mediaId = (title: string): number | null => {
    const row = db.get<{ id: number }>('SELECT id FROM media WHERE title = ?', title);
    if (row) return row.id;
    const m = media.find((x) => x.title === title);
    if (!m) return null;
    const order = db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM media')!.n;
    const r = db.run('INSERT INTO media(title, kind, emoji, bedtime_ok, sort_order) VALUES(?,?,?,?,?)', m.title, m.kind, m.emoji ?? null, m.bedtime_ok ? 1 : 0, order);
    if (m.cover) copySeedImage(db, cfg, m.cover, 'media', String(r.lastId), now);
    return r.lastId;
  };

  // Inner orbit: fixed slots.
  for (const it of seed.inner) {
    if (!has(it.id)) continue;
    const mid = it.media ? mediaId(it.media) : null;
    db.run(
      `UPDATE items SET orbit = 'inner', orbit_slot = ?, parent_id = NULL, tap = ?, short_label = COALESCE(?, short_label),
         emoji = COALESCE(?, emoji), media_id = COALESCE(?, media_id), category = CASE WHEN ? IS NOT NULL THEN 'media' ELSE category END
       WHERE id = ?`,
      it.slot, it.tap ?? 'add', it.short_label ?? null, it.emoji ?? null, mid, mid, it.id,
    );
  }

  // The dock, after the family (e.g. Pongo, Barney).
  applyDock(db, seed.dock ?? [], mediaId);

  // People are not in the orbit (v0.8): they are in the taskbar and on the globe.

  // Sub-orbits (Eat -> foods).
  for (const [parent, children] of Object.entries(seed.sub_orbits)) {
    if (!has(parent)) continue;
    children.forEach((child, slot) => {
      if (child && has(child)) db.run("UPDATE items SET parent_id = ?, orbit = 'inner', orbit_slot = ? WHERE id = ?", parent, slot, child);
    });
  }

  // Body parts for "My body".
  for (const b of BODY_PARTS) {
    if (has(bodyItemId(b.id))) continue;
    db.run(
      `INSERT INTO items(id, category, kind, label_en, label_es, emoji, tap, updated_at) VALUES(?, 'body', 'thing', ?, ?, ?, 'none', ?)`,
      bodyItemId(b.id), b.en, b.es, b.emoji, now,
    );
  }

  // Starter time rules.
  for (const r of seed.rules) {
    if (!has(r.item)) continue;
    const routine = r.routine ? db.get<{ id: number }>('SELECT id FROM schedule_items WHERE label = ?', r.routine) : undefined;
    if (r.routine && !routine) continue;
    db.run(
      `INSERT INTO item_rules(item_id, kind, blocks, start_min, end_min, routine_item_id, routine_open_min) VALUES(?,?,?,?,?,?,?)`,
      r.item, r.kind, r.blocks ? 1 : 0, r.start ? hm(r.start) : null, r.end ? hm(r.end) : null, routine?.id ?? null, r.open_min ?? null,
    );
  }

  if (!db.get("SELECT 1 FROM settings WHERE key = 'pain_policy'")) db.setSetting('pain_policy', seed.pain_policy);
  if (!db.get("SELECT 1 FROM settings WHERE key = 'voice_retention_days'")) db.setSetting('voice_retention_days', seed.voice_retention_days);
}

/** Puts items in the dock (after the family) and takes them out of any orbit. */
export function applyDock(db: Db, dock: { id: string; tap?: string; media?: string }[], mediaId: (title: string) => number | null) {
  const ids: string[] = [];
  for (const d of dock) {
    if (!db.get('SELECT 1 FROM items WHERE id = ?', d.id)) continue;
    const mid = d.media ? mediaId(d.media) : null;
    db.run(
      `UPDATE items SET orbit = NULL, orbit_slot = NULL, parent_id = NULL, tap = COALESCE(?, tap), media_id = COALESCE(?, media_id),
         category = CASE WHEN ? IS NOT NULL THEN 'media' ELSE category END WHERE id = ?`,
      d.tap ?? null, mid, mid, d.id,
    );
    ids.push(d.id);
  }
  db.setSetting('dock_items', ids);
}
