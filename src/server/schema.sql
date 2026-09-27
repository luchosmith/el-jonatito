-- El Jonatito schema (SQLite), version 6. Applied idempotently at startup.
-- Older databases are upgraded by migrate.ts.
PRAGMA foreign_keys = ON;

-- Person / pet details. What Jonatito sees (label, picture, slot) lives in `items`, same id.
CREATE TABLE IF NOT EXISTS people (
  id            TEXT PRIMARY KEY,               -- 'mommy_joyce', 'lexi'
  kind          TEXT NOT NULL CHECK (kind IN ('person','pet')),
  display_name  TEXT NOT NULL,
  relation      TEXT,
  role          TEXT CHECK (role IN ('child','caretaker','friend')),
  is_self       INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL,               -- fixed; never re-sorted (motor planning)
  species       TEXT,
  breed         TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  pin_hash      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('child','caretaker','friend')),
  person_id     TEXT REFERENCES people(id)
);

-- One row for everything Jonatito can touch: people, pets, foods, actions, places, media, body parts.
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,               -- 'eat', 'grapes', 'mommy_joyce', 'pongo', 'body_tummy'
  category      TEXT NOT NULL CHECK (category IN
                  ('person','pet','food','drink','action','place','feeling','play','media','body','social','urgent','core')),
  kind          TEXT NOT NULL CHECK (kind IN ('person','pet','action','thing','desc','social','urgent')),  -- token kind / colour
  label_en      TEXT NOT NULL,                  -- spoken and used in sentences ("take a bath")
  label_es      TEXT NOT NULL,
  short_label   TEXT,                           -- shown under the picture ("Bath")
  emoji         TEXT,                           -- fallback until a picture exists
  tap           TEXT NOT NULL DEFAULT 'add' CHECK (tap IN ('add','open','play','body','none')),
  parent_id     TEXT REFERENCES items(id),      -- lives in this item's sub-orbit; NULL = main orbit / board only
  orbit         TEXT CHECK (orbit IN ('inner','outer')),
  orbit_slot    INTEGER,                        -- fixed; never recomputed
  grid_page     TEXT,
  grid_row      INTEGER,
  grid_col      INTEGER,
  user_id       INTEGER REFERENCES users(id),   -- the person's account (people only)
  media_id      INTEGER REFERENCES media(id),   -- what a 'play' item plays
  badge_color   TEXT,
  log_trackable INTEGER NOT NULL DEFAULT 0,
  alias_of      TEXT REFERENCES items(id),      -- same word on another page (water on Drinks = water on Food)
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  updated_by    INTEGER REFERENCES users(id),
  UNIQUE (grid_page, grid_row, grid_col)
);
CREATE UNIQUE INDEX IF NOT EXISTS items_slot ON items(COALESCE(parent_id, ''), orbit, orbit_slot) WHERE orbit IS NOT NULL;

-- Every picture ever used for an item or a media cover; the newest active one wins.
CREATE TABLE IF NOT EXISTS images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('item','media','event','schedule_day','template')),
  owner_id      TEXT NOT NULL,
  file          TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_owner ON images(owner_type, owner_id, is_active);

-- Recorded words, versioned like images; no active clip = text-to-speech.
CREATE TABLE IF NOT EXISTS audio_clips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('item')),
  owner_id      TEXT NOT NULL,
  lang          TEXT NOT NULL CHECK (lang IN ('en','es')),
  file          TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  uploaded_by   INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audio_owner ON audio_clips(owner_type, owner_id, lang, is_active);

-- When an item is open: time windows, daily limits, minimum intervals.
CREATE TABLE IF NOT EXISTS item_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('window','limit','interval')),
  blocks           INTEGER NOT NULL DEFAULT 1,  -- 1: closed with a clock in the orbit; 0: only a gentle reminder
  days             INTEGER,                     -- bitmask Sun..Sat; NULL = every day
  start_min        INTEGER,
  end_min          INTEGER,
  routine_item_id  INTEGER REFERENCES schedule_items(id) ON DELETE CASCADE,
  routine_open_min INTEGER,
  max_per_day      INTEGER,
  min_interval_min INTEGER,
  suggest_item_id  TEXT REFERENCES items(id)
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
  kind          TEXT NOT NULL CHECK (kind IN ('yes','wait','no','coming','voice','text')),
  eta_at        TEXT,
  audio_file    TEXT,
  text          TEXT,                           -- typed reply (read aloud on the tablet)
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  symbol_id     TEXT REFERENCES items(id),      -- the item (food, drink, body part...)
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
  symbol_id     TEXT,                           -- the default picture (a word), e.g. breakfast -> smoothie
  start_min     INTEGER NOT NULL,               -- minutes after midnight (daily routine)
  choices       TEXT                            -- JSON item ids caretakers pick from for one day, e.g. breakfast
);

-- One day's pick for one routine slot ("breakfast tomorrow: eggs", or a custom photo for that day only).
CREATE TABLE IF NOT EXISTS schedule_days (
  schedule_id   INTEGER NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,                  -- 'YYYY-MM-DD', local time
  item_id       TEXT REFERENCES items(id) ON DELETE SET NULL,  -- NULL = a custom photo (images owner_type 'schedule_day', owner_id '<id>:<day>')
  label         TEXT,
  set_by        INTEGER REFERENCES users(id),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (schedule_id, day)
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

-- Voice notes for Jonatito ("a familiar voice"): recorded in the family app, or voice replies.
CREATE TABLE IF NOT EXISTS voice_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  audio_file    TEXT NOT NULL,
  duration_s    REAL,
  created_at    TEXT NOT NULL,
  heard_at      TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,     -- comfort clips: first on the shelf, never expire
  hidden        INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','reply','whatsapp')),
  label         TEXT                            -- the sender's name for the clip, to send it again
);
CREATE INDEX IF NOT EXISTS voice_from ON voice_notes(from_user_id, created_at);

-- Where each adult is (city level only).
CREATE TABLE IF NOT EXISTS locations (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  place_label   TEXT NOT NULL,
  country_code  TEXT NOT NULL,
  tz            TEXT NOT NULL,
  lat           REAL NOT NULL,                  -- rounded to 0.1° (~10 km)
  lon           REAL NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('manual','phone')),
  until         TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pain_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  body_part     TEXT NOT NULL,
  side          TEXT,
  level         INTEGER NOT NULL CHECK (level BETWEEN 0 AND 5),
  at            TEXT NOT NULL,
  message_id    INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  handled_by    INTEGER REFERENCES users(id),
  handled_at    TEXT
);

-- Everything he taps, grouped into moments (one intent each).
CREATE TABLE IF NOT EXISTS moments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL,
  last_at       TEXT NOT NULL,
  ended_at      TEXT,
  outcome       TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','sent','cleared','not_sent')),
  tokens        TEXT NOT NULL DEFAULT '[]',     -- JSON Token[]: the strip as he built it
  sentence_en   TEXT,
  sentence_es   TEXT,
  message_id    INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  answered_by   INTEGER REFERENCES users(id),
  notified      TEXT NOT NULL DEFAULT '[]'      -- person ids told about it (💭)
);
CREATE INDEX IF NOT EXISTS moments_at ON moments(started_at);

CREATE TABLE IF NOT EXISTS tap_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  moment_id     INTEGER REFERENCES moments(id) ON DELETE CASCADE,
  item_id       TEXT REFERENCES items(id) ON DELETE SET NULL,
  person_id     TEXT REFERENCES people(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  screen        TEXT NOT NULL,
  detail        TEXT
);
CREATE INDEX IF NOT EXISTS taps_at ON tap_events(at);

-- Notifications, batched per person (the inbox itself is always live).
CREATE TABLE IF NOT EXISTS notify_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('message','face','reply','urgent','panic')),
  message_id    INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  moment_id     INTEGER REFERENCES moments(id) ON DELETE CASCADE,
  summary       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT,
  batch_id      INTEGER
);
CREATE INDEX IF NOT EXISTS notify_pending ON notify_queue(user_id, delivered_at);

CREATE TABLE IF NOT EXISTS notify_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  batch_min     INTEGER NOT NULL DEFAULT 10,    -- 0 = every message notifies
  face_taps     INTEGER NOT NULL DEFAULT 1      -- include 💭 in updates
);

-- Calendar: scheduled events (future side of his timeline) and photos put on his day (past side).
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  starts_at     TEXT NOT NULL,
  title         TEXT NOT NULL,
  emoji         TEXT,
  kind          TEXT NOT NULL DEFAULT 'event' CHECK (kind IN ('event','photo')),
  template      TEXT,                           -- doctor | dentist | playdate | … (its default picture)
  person_ids    TEXT NOT NULL DEFAULT '[]',
  show_from_min INTEGER NOT NULL DEFAULT 1440,  -- appears on his timeline this long before it starts
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_at ON events(starts_at);

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
