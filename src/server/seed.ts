// Loads the family, vocabulary, media and routine from /seed into an empty database.
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.ts';
import { hashPin } from './auth.ts';
import type { Config } from './config.ts';

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
    routine: { emoji: string; label: string; at: string; symbol?: string }[];
  }>(path.join(dir, 'media.json'));

  const imagesDir = path.join(cfg.uploadsDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(path.join(cfg.uploadsDir, 'audio'), { recursive: true });
  const now = new Date().toISOString();

  const copyImage = (rel: string, ownerType: string, ownerId: string) => {
    const src = path.join(dir, rel);
    if (!fs.existsSync(src)) return;
    const file = `seed-${ownerType}-${ownerId}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(imagesDir, file));
    db.run('INSERT INTO images(owner_type, owner_id, file, is_active, created_at) VALUES(?,?,?,1,?)', ownerType, ownerId, file, now);
  };

  db.tx(() => {
    for (const p of people) {
      const kind = p.kind ?? 'person';
      const emoji = p.placeholder_emoji ?? (kind === 'pet' ? '🐾' : DEFAULT_EMOJI[p.relation ?? ''] ?? '🙂');
      db.run(
        `INSERT INTO people(id, kind, display_name, short_label, label_es, relation, role, is_self, is_visible, sort_order, species, breed, emoji)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        p.id, kind, p.display_name, p.short_label, p.is_self ? 'Yo' : p.short_label, p.relation, p.role,
        p.is_self ? 1 : 0, p.is_visible === false ? 0 : 1, p.order, p.species ?? null, p.breed ?? null, emoji,
      );
      if (p.photo) copyImage(p.photo, 'person', p.id);
    }

    for (const u of users) {
      db.run('INSERT INTO users(username, pin_hash, role, person_id) VALUES(?,?,?,?)', u.username, hashPin(u.pin), u.role, u.person_id);
      const id = db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', u.username)!.id;
      if (u.role !== 'child') db.run('INSERT INTO availability(user_id, status, until, updated_at) VALUES(?,?,NULL,?)', id, 'available', now);
    }

    for (const f of food) {
      db.run(
        `INSERT INTO symbols(id, category, kind, emoji, label_en, label_es, grid_page, grid_row, grid_col, badge_color, log_trackable)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        f.key, f.category, 'thing', f.placeholder_emoji, f.labels.en, f.labels.es, 'food', f.grid_row, f.grid_col,
        f.badge_color ?? null, f.log_trackable === false ? 0 : 1,
      );
    }
    for (const s of vocab.symbols) {
      db.run(
        `INSERT INTO symbols(id, category, kind, emoji, label_en, label_es, grid_page, grid_row, grid_col, log_trackable, alias_of)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        s.id, s.page, s.kind, s.emoji, s.en, s.es, s.page, s.row, s.col, s.log ? 1 : 0, s.alias_of ?? null,
      );
      if (s.photo) copyImage(s.photo, 'symbol', s.id);
    }
    for (const f of food) {
      if (!f.limit) continue;
      db.run(
        'INSERT INTO limits(symbol_id, max_per_day, min_interval_min, suggest_symbol_id) VALUES(?,?,?,?)',
        f.key, f.limit.max_per_day ?? null, f.limit.min_interval_min ?? null, f.limit.suggest ?? null,
      );
    }

    media.items.forEach((m, i) => {
      const r = db.run('INSERT INTO media(title, kind, emoji, bedtime_ok, sort_order) VALUES(?,?,?,?,?)', m.title, m.kind, m.emoji ?? null, m.bedtime_ok ? 1 : 0, i);
      if (m.cover) copyImage(m.cover, 'media', String(r.lastId));
    });
    for (const r of media.routine) {
      db.run('INSERT INTO schedule_items(emoji, label, symbol_id, start_min) VALUES(?,?,?,?)', r.emoji, r.label, r.symbol ?? null, hm(r.at));
    }

    db.setSetting('media_policy', {
      session_max_min: media.policy.session_max_min,
      sleep_start_min: hm(media.policy.sleep_start),
      sleep_end_min: hm(media.policy.sleep_end),
    });
    db.setSetting('quiet_hours', { start_min: hm('21:00'), end_min: hm('07:00') });
    db.setSetting('pages', vocab.pages);
  });
}

export function isSeeded(db: Db) {
  return (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM people')?.n ?? 0) > 0;
}
