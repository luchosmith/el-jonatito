-- Frozen copy of the v2 schema (before the item catalog), used by test/migrate.test.ts.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id            TEXT PRIMARY KEY,               -- 'mommy_joyce', 'lexi'
  kind          TEXT NOT NULL CHECK (kind IN ('person','pet')),
  display_name  TEXT NOT NULL,
  short_label   TEXT NOT NULL,                  -- what Jonatito sees / hears
  label_es      TEXT,
  relation      TEXT,
  role          TEXT CHECK (role IN ('child','caretaker','friend')),
  is_self       INTEGER NOT NULL DEFAULT 0,
  is_visible    INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL,               -- fixed; never re-sorted (motor planning)
  species       TEXT,
  breed         TEXT,
  emoji         TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  pin_hash      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('child','caretaker','friend')),
  person_id     TEXT REFERENCES people(id)
);

-- Every picture ever used for a person / symbol / media item; the newest active one wins.
CREATE TABLE IF NOT EXISTS images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('person','symbol','media')),
  owner_id      TEXT NOT NULL,
  file          TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_owner ON images(owner_type, owner_id, is_active);

CREATE TABLE IF NOT EXISTS symbols (
  id            TEXT PRIMARY KEY,               -- 'grapes', 'eat', 'help'
  category      TEXT NOT NULL,                  -- food, drink, action, place, feel, play, core
  kind          TEXT NOT NULL,                  -- token kind (thing, action, desc, social, urgent)
  emoji         TEXT NOT NULL,
  label_en      TEXT NOT NULL,
  label_es      TEXT NOT NULL,
  grid_page     TEXT NOT NULL,
  grid_row      INTEGER NOT NULL,
  grid_col      INTEGER NOT NULL,
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  badge_color   TEXT,
  log_trackable INTEGER NOT NULL DEFAULT 0,
  alias_of      TEXT,                           -- same word on another page (e.g. water on Drinks = water on Food)
  UNIQUE (grid_page, grid_row, grid_col)
);

CREATE TABLE IF NOT EXISTS limits (
  symbol_id        TEXT PRIMARY KEY REFERENCES symbols(id),
  max_per_day      INTEGER,
  min_interval_min INTEGER,
  suggest_symbol_id TEXT REFERENCES symbols(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  to_person_id  TEXT REFERENCES people(id),
  tokens        TEXT NOT NULL,                  -- JSON Token[]
  sentence_en   TEXT NOT NULL,
  sentence_es   TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'normal',
  audio_file    TEXT,
  notes         TEXT NOT NULL DEFAULT '[]',     -- JSON DispatchNote[]
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_recipients (
  message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  seen_at       TEXT,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id    INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('yes','wait','no','coming','voice')),
  eta_at        TEXT,
  audio_file    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  symbol_id     TEXT REFERENCES symbols(id),
  amount        REAL,
  note          TEXT,
  at            TEXT NOT NULL,
  entered_by    INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS log_at ON log_entries(at);

CREATE TABLE IF NOT EXISTS availability (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('available','busy','away')),
  until         TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  emoji         TEXT NOT NULL,
  label         TEXT NOT NULL,
  symbol_id     TEXT,
  start_min     INTEGER NOT NULL                -- minutes after midnight (daily routine)
);

CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  emoji         TEXT,
  file          TEXT,
  bedtime_ok    INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id      INTEGER NOT NULL REFERENCES media(id),
  started_at    TEXT NOT NULL,
  ends_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL                   -- JSON
);

CREATE TABLE IF NOT EXISTS audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  action        TEXT NOT NULL,
  target        TEXT,
  at            TEXT NOT NULL
);
