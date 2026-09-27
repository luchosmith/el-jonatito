// Loads the family, vocabulary, media and routine from /seed into an empty database (schema v3).
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import { hashPin } from './auth.ts';
import type { Config } from './config.ts';
import { applyOrbitDefaults, copySeedImage, insertLimitRules, PAGE_CATEGORY } from './orbit.ts';
import { SCHEMA_VERSION } from './migrate.ts';

interface SeedPerson {
  id: string;
  kind?: 'person' | 'pet';
  display_name: string;
  short_label: string;
  relation: string | null;
  relation_label?: { en: string | null; es: string | null };
  photo: string | null;
  order: number;
  role: 'child' | 'caretaker' | 'friend' | null;
  is_self?: boolean;
  is_visible?: boolean;
  species?: string;
  breed?: string;
  placeholder_emoji?: string;
}

interface FoodSymbol {
  key: string;
  category: string;
  placeholder_emoji: string;
  labels: { en: string; es: string };
  grid_row: number;
  grid_col: number;
  badge_color?: string;
  log_trackable?: boolean;
  limit?: { max_per_day?: number; min_interval_min?: number; suggest?: string };
  photo?: string;
  short_label?: string;
}

interface VocabSymbol {
  id: string; page: string; row: number; col: number; kind: string; emoji: string; en: string; es: string; log?: boolean; alias_of?: string; photo?: string;
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

const DEFAULT_EMOJI: Record<string, string> = {
  mother: '👩', father: '👨', grandfather: '👴', grandmother: '👵', self: '🧑',
};

export function seed(db: Db, cfg: Config) {
  const dir = cfg.seedDir;
  const people = readJson<{ people: SeedPerson[] }>(path.join(dir, 'known_persons.json')).people;
  const users = readJson<{ users: { username: string; pin: string; role: string; person_id: string }[] }>(
    path.join(dir, 'users.json'),
  ).users;
  const food = readJson<{ symbols: FoodSymbol[] }>(path.join(dir, 'food_vocabulary.json')).symbols;
  const vocab = readJson<{ pages: unknown[]; symbols: VocabSymbol[] }>(path.join(dir, 'vocabulary.json'));
  const media = readJson<{
    policy: { session_max_min: number; sleep_start: string; sleep_end: string };
    items: { title: string; kind: string; emoji?: string; cover?: string; bedtime_ok?: boolean }[];
    routine: { emoji: string; label: string; at: string; symbol?: string; choices?: string[] }[];
  }>(path.join(dir, 'media.json'));

  fs.mkdirSync(path.join(cfg.uploadsDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(cfg.uploadsDir, 'audio'), { recursive: true });
  const now = new Date().toISOString();

  db.tx(() => {
    for (const p of people) {
      const kind = p.kind ?? 'person';
      db.run(
        `INSERT INTO people(id, kind, display_name, relation, role, is_self, sort_order, species, breed) VALUES(?,?,?,?,?,?,?,?,?)`,
        p.id, kind, p.display_name, p.relation, p.role, p.is_self ? 1 : 0, p.order, p.species ?? null, p.breed ?? null,
      );
    }

    for (const u of users) {
      db.run('INSERT INTO users(username, pin_hash, role, person_id) VALUES(?,?,?,?)', u.username, hashPin(u.pin), u.role, u.person_id);
      const id = db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', u.username)!.id;
      if (u.role !== 'child') db.run('INSERT INTO availability(user_id, status, until, updated_at) VALUES(?,?,NULL,?)', id, 'available', now);
    }

    for (const p of people) {
      const kind = p.kind ?? 'person';
      const emoji = p.placeholder_emoji ?? (kind === 'pet' ? '🐾' : DEFAULT_EMOJI[p.relation ?? ''] ?? '🙂');
      const user = db.get<{ id: number }>('SELECT id FROM users WHERE person_id = ?', p.id);
      db.run(
        `INSERT INTO items(id, category, kind, label_en, label_es, short_label, emoji, user_id, is_hidden, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        p.id, kind, kind, p.short_label, p.is_self ? 'Yo' : p.short_label, p.short_label, emoji, user?.id ?? null,
        p.is_visible === false ? 1 : 0, now,
      );
      if (p.photo) copySeedImage(db, cfg, p.photo, 'item', p.id, now);
    }

    for (const f of food) {
      db.run(
        `INSERT INTO items(id, category, kind, label_en, label_es, emoji, grid_page, grid_row, grid_col, badge_color, log_trackable, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        f.key, PAGE_CATEGORY[f.category] ?? 'food', 'thing', f.labels.en, f.labels.es, f.placeholder_emoji, 'food', f.grid_row, f.grid_col,
        f.badge_color ?? null, f.log_trackable === false ? 0 : 1, now,
      );
      if (f.short_label) db.run('UPDATE items SET short_label = ? WHERE id = ?', f.short_label, f.key);
      if (f.photo) copySeedImage(db, cfg, f.photo, 'item', f.key, now);
    }
    for (const s of vocab.symbols) {
      db.run(
        `INSERT INTO items(id, category, kind, label_en, label_es, emoji, grid_page, grid_row, grid_col, log_trackable, alias_of, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        s.id, PAGE_CATEGORY[s.page] ?? 'core', s.kind, s.en, s.es, s.emoji, s.page, s.row, s.col, s.log ? 1 : 0, null, now,
      );
      if (s.photo) copySeedImage(db, cfg, s.photo, 'item', s.id, now);
    }
    // Second pass: an alias may point at a word on a later page.
    for (const s of vocab.symbols) if (s.alias_of) db.run('UPDATE items SET alias_of = ? WHERE id = ?', s.alias_of, s.id);
    for (const f of food) if (f.limit) insertLimitRules(db, f.key, f.limit);

    media.items.forEach((m, i) => {
      const r = db.run('INSERT INTO media(title, kind, emoji, bedtime_ok, sort_order) VALUES(?,?,?,?,?)', m.title, m.kind, m.emoji ?? null, m.bedtime_ok ? 1 : 0, i);
      if (m.cover) copySeedImage(db, cfg, m.cover, 'media', String(r.lastId), now);
    });
    for (const r of media.routine) {
      db.run('INSERT INTO schedule_items(emoji, label, symbol_id, start_min, choices) VALUES(?,?,?,?,?)',
        r.emoji, r.label, r.symbol ?? null, hm(r.at), r.choices ? JSON.stringify(r.choices) : null);
    }

    db.setSetting('media_policy', {
      session_max_min: media.policy.session_max_min,
      sleep_start_min: hm(media.policy.sleep_start),
      sleep_end_min: hm(media.policy.sleep_end),
    });
    db.setSetting('quiet_hours', { start_min: hm('21:00'), end_min: hm('07:00') });
    db.setSetting('pages', vocab.pages);

    applyOrbitDefaults(db, cfg);
  });
  db.raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function isSeeded(db: Db) {
  return (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM people')?.n ?? 0) > 0;
}
