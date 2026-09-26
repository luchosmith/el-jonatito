# El Jonatito — Technical Specification

Version 0.3 · Draft · September 2026 · Companion to `Jonatito_Project_Plan.md`

> **Build status (v0.3, built September 2026).** The running app (`src/`) uses a lighter stack than sections 1–2 describe: one **Node 22** process with **SQLite** (`node:sqlite`), server-sent events for live updates, and a React web app built with esbuild. See `src/README.md`. The target architecture below still applies to later phases. Section 5 (orbit home and item catalog) is written against the running build.

---

## 1. Architecture at a glance

```
                    ┌──────────────────────────── Internet ───────────────────────────┐
                    │                                                                  │
  Jonatito tablet   │   Family phones (installed web app)     Google Calendar API        │
  (kiosk web app)   │   Web Push / WhatsApp                   Open-Meteo weather API     │
        │           │           │                                                      │
        └──── HTTPS ┴───────────┴──► Cloudflare (CDN cache + Tunnel + Access) ◄──────────┘
                                                │  (no open ports at home)
                                                ▼
                         ┌──────────── Home server (mini PC, Docker) ────────────┐
                         │  Caddy (reverse proxy)                                 │
                         │   ├─ /            → web app static build (cached)      │
                         │   ├─ /api, /rt    → PocketBase (auth, DB, realtime,    │
                         │   │                 file storage, admin UI)            │
                         │   └─ /jobs        → Worker (Node): dispatcher, push,   │
                         │                     calendar sync, weather, WhatsApp   │
                         │  LiveKit (WebRTC audio SFU) ── UDP ports forwarded     │
                         │  (optional) whisper.cpp for caretaker voice commands   │
                         │  Litestream / restic → encrypted off-site backup       │
                         └────────────────────────────────────────────────────────┘
```

**How "hosted locally with publicly available cache sites" works:** the app runs on a small computer at home. **Cloudflare Tunnel** makes it reachable at a public HTTPS address (for example `jonatito.yourdomain.com`) without opening router ports. Cloudflare's CDN caches the static app files worldwide. The **service worker** in the app caches everything the tablet needs offline.

---

## 2. Technology choices

| Layer | Choice | Why |
|---|---|---|
| Front-end | **React 19 + TypeScript + Vite**, installable offline web app (PWA) via `vite-plugin-pwa` (Workbox) | One codebase for tablet + phones, installs to the home screen, works offline |
| Styling/animation | Tailwind CSS + Framer Motion (with reduced motion honored) | Fast to build, calm transitions |
| Local state/offline | Zustand + IndexedDB (via `idb`) outbox queue | Messages queue while offline |
| Backend | **PocketBase** (single Go binary, SQLite) | Auth, REST, realtime subscriptions, file storage, and an admin UI in one small binary. Easy to self-host |
| Jobs / integrations | Small **Node 22 worker** (TypeScript) using the PocketBase SDK | Dispatcher rules, Google Calendar sync, Web Push, WhatsApp, weather |
| Real-time audio | **LiveKit** (self-hosted Docker) or **LiveKit Cloud** free tier | Reliable WebRTC with good mobile SDKs. The cloud tier avoids router UDP setup |
| Voice notes | MediaRecorder API (Opus/WebM, AAC fallback on iOS) → stored in PocketBase | Simple, no extra service |
| Text-to-speech | Web Speech API `speechSynthesis` (offline on most devices) + pre-recorded family clips; optional Piper TTS on the server for a consistent voice | Free, fast, and the family voice matters |
| Speech-to-text (caretakers) | Web Speech API recognition (Chrome/Android) or **whisper.cpp** on the server | Voice logging/commands |
| Weather/sun | **Open-Meteo** (free, no API key): temperature, weather code, sunrise/sunset | No account needed |
| Calendar | **Google Calendar API** v3 (`freeBusy`, `events.list`, push channels) | Family already uses Google |
| Notifications | **Web Push** (VAPID, `web-push` npm), batched per person (5.14); SMS only for unanswered urgent alerts later | Web push is free and private; WhatsApp was considered and dropped |
| Symbols | **ARASAAC** (CC BY-NC-SA), **Mulberry Symbols** (CC BY-SA), **OpenMoji** (CC BY-SA) + real photos | Free, AAC-standard, Spanish-friendly (ARASAAC is from Spain) |
| Hosting | Docker Compose on a mini PC (e.g. Intel N100, 8–16 GB RAM, SSD) or Raspberry Pi 5 | Low power, silent, always on |
| Edge | **Cloudflare** Tunnel + CDN + Access (Zero Trust for the parent admin UI) | Free tier covers this use |
| Backup | Litestream (continuous SQLite replication) to Backblaze B2 / Cloudflare R2, plus restic for files | A minor's data, so encrypted off-site copies |

> **Why not all-cloud (Firebase/Supabase)?** Both work fine and are simpler to operate. The self-hosted design keeps a minor's data in the family's hands, as requested. The front-end talks to PocketBase through one small adapter, so switching to Supabase later is contained.

---

## 3. Devices & kiosk

- **Jonatito's tablet:** 10–11" in landscape, in a rugged case with a handle. Recommended: Android tablet with **Fully Kiosk Browser** (locks to the app, keeps the screen on, schedules the screen off at night) or an **iPad** with **Guided Access**.
- Microphone and speaker permissions are granted once in parent mode.
- The screen dims automatically at bedtime (from the schedule), and the app switches to a "Night" board (*water, toilet, scared, Mom*).

---

## 4. Data model (PocketBase collections)

```text
users            id, name, role [child|caretaker|friend|therapist], avatar(file), pin_hash,
                 push_subscriptions(json), whatsapp, phone, locale, voice_clip_hello(file)

people           id, kind [person|pet], user(rel users?), display_name, short_label ("Me"), relation ("Abuelo"), is_self(bool),
                 species?, breed?, photo(file),
                 order(int, fixed), ring_color, hotspots(json), is_visible, channels(json)
                 -- the avatars shown on the board; may exist without a login (e.g. pets). Pets sit in their own
                 -- "🐾 Pets" group in the dock; they can be used in sentences but never receive messages.

symbols          id, key ("grapes"), category [people|food|drink|action|place|feeling|play|body|clothes|social|urgent],
                 fitz_color, image(file), photo(file?), labels(json {es,en}), audio(json {es,en} files),
                 grid_page, grid_row, grid_col (fixed!), is_hidden, log_trackable(bool), badge_color?

phrases          id, tokens(json [symbol_ids|person_ids]), pinned(bool), order

messages         id, from(rel users), to(rel people|null), tokens(json), sentence_text, audio(file?),
                 priority [normal|urgent], status [queued|delivered|seen|replied|escalated],
                 dispatch_notes(json), created, delivered_at, replied_at

replies          id, message(rel), from(rel users), kind [yes|wait|no|coming|voice|text],
                 eta_minutes, audio(file?), text

log_entries      id, type [food|drink|meds|sleep|toilet|mood|activity], symbol(rel?), amount [0.25..1],
                 note, at(datetime), entered_by(rel users)

limits           id, symbol(rel), max_per_day, min_interval_min, message_when_hit, suggest_symbol(rel?)

schedule_items   id, date_or_rrule, start, end, symbol(rel), label, source [manual|gcal], gcal_event_id

availability     id, user(rel), status [available|busy|away], until(datetime), source [manual|gcal]

media            id, title, kind [movie|episode|song|album|clip|photo|story|game], file(file) | path (server media library),
                 thumb(file), cover_photo(file), approved(bool), is_favorite(bool), pin_offline(bool),
                 duration_s, bookmarks(json [{t_start,t_end,label}]), resume_at_s, bedtime_ok(bool), order, grid_row, grid_col

playlists        id, name ("Bath songs"), symbol(rel), items(json [media_ids]), linked_routine(rel schedule_items?)

media_sessions   id, media(rel), started_at, ended_at, seconds_watched, ended_by [timer|child|caretaker|sleep_lock]

media_policy     singleton: daily_budget_min, session_max_min, warn_before_min, sleep_lock {start, end, wind_down_min},
                 bedtime_playlist(rel playlists), caretaker_override_min

images           id, owner_type [person|symbol|place|media|user], owner_id, file(file), crop(json), kind [photo|symbol|drawing],
                 is_active(bool), uploaded_by(rel users), created   -- version history for every picture in the app

places           id, name ("Abuela Pilar's house"), photo(file), symbol(rel), geo {lat, lon, radius_m}, wifi_ssids(json)

settings         singleton: location {lat, lon, city, hemisphere}, timezone, quiet_hours, languages,
                 tts_voice, volumes, grid_size, show_text_labels, day_start, day_end

audit            id, actor, action, target, at   -- parent-mode changes

-- Future (sections 11–12)
vocalizations    id, audio(file), recorded_at, source [tablet|caretaker_phone], label_symbol(rel symbols?),
                 label_source [caretaker|tap_pairing|confirmed_by_child], confidence, used_for_training(bool), consent_ok(bool)

status_signals   id, at, kind [activity|audio_event|heart_rate|presence|mood_estimate], value(json), confidence,
                 source_device, confirmed_by(rel users?)   -- derived features only, never raw video
```

> **v0.3 change:** `symbols`, the display fields of `people`, and the display fields of `media` merge into one **`items`** catalog: one row for everything Jonatito can touch. `limits` becomes `item_rules`. New tables: `audio_clips`, `voice_notes`, `locations`, `pain_reports`. See section 5.9 for the SQL.

**Seed data: known persons.** `known_persons/known_persons.json` (with face-cropped avatars in `known_persons/avatars/`, 512×512 JPG) is the running list of known people. A first-run migration imports it into `people`, and each avatar goes into `people.photo` plus an `images` history row. So far: **Jonatito** (the user himself: `role: child`, `is_self: true`, shown as the "Me" button bottom-left and at the start of every sentence strip), Mommy Joyce, Larry (Papi), Abuelo Lucho, Abuela Pilar, TinTin (Justin). **Pets:** Lexi (poodle), Loki (calico cat), Logan (grey long-haired cat).

**Seed data: food vocabulary.** `vocabulary/food_vocabulary.json` holds the starter food & drink symbols in fixed grid positions, with English and Spanish labels: water, smoothie, chicken soup, rice bowl, grapes, pancakes, pasta with red sauce and pasta with green sauce. The two pastas share a picture, so each has a **colored sauce badge** (red/green) until real photos replace them. Starter limits: smoothie max 2/day (suggest water); grapes get a reminder if eaten in the last 60 min. `symbols` gets an optional `badge_color` field.

**Access rules (PocketBase API rules):**
- `child` can create `messages`, read their own replies, read symbols/people/schedule/media/logs about themselves.
- `caretaker` (**admin**) has full CRUD except `audit`, and is the only role that can replace pictures (see section 9).
- `friend` can read messages addressed to them, create replies, update their own availability, and upload media as `approved=false`.
- `therapist` has read access to logs and messages (with parent consent), no writes.

---

## 5. Orbit home & item catalog (v0.3)

### 5.1 Why an orbit
Jonatito understands the world as something that revolves around him. So the home screen puts **him in the middle**, and everything he can reach floats around him:

- his **core needs** (Eat, Bath, Toilet, Go, favorite things) in a close **inner orbit**;
- his **people** in a wider **outer orbit**;
- the **ground** under his feet, with a pin where he is.

The orbit is the **default screen**. The picture-board grid (section 7) stays available from the dock as "All words" while he makes the transition.

### 5.2 Layout (1280×800 tablet, landscape)

```
┌─ Here & Now bar (unchanged) ─────────────────────────────────────────────┐
├─ Sentence strip: [Me] [Mommy] [Eat] [Grapes]           🔊  ✖  ➤         ┤
│                              (Mommy〰²)                   outer orbit:  │
│          (TinTin)      [Pongo]        [Eat]                 people      │
│                  [Barney]   ( JONATITO )   [Bath]        (Lucho)        │
│          (Larry)       [Go]          [Toilet]                            │
│                                                      (Pilar ✈️)          │
│   ~~~~~~~~~~~~~~~~~~~~~~~~~~ ground ~~ 📍 ~~~~~~~~~~~~~~~~~~~~~~~~~~       │
├─ Dock: [Me]  faces…  pets…                     [All words] [Day] [Media] ┤
```

- **Fixed slots, never recomputed.** The inner orbit has **8 slots**, every 45°, starting half a step past 12:00, so no inner slot sits straight above or below his face. The outer orbit has **10 slots**, every 36° from 12:00. Its 12:00 and 6:00 slots always stay empty: on a landscape screen 12:00 crowds the inner orbit, and 6:00 is where his ground pin sits. That leaves **8 slots for people**. An item keeps its slot for good. A new item takes an empty slot, and a hidden item leaves a gap. This is the "icons never move" rule applied to the orbit. *The v0.2 build spaces items evenly by count, so adding Barney shifted the others. v0.3 fixes this.*
- Both orbits are ellipses sized in percent of the stage (inner 20% × 30%, outer 40% × 38%), so the layout scales from a 10" to a 13" tablet.
- Items bob gently (±5 px, 4.5 s). The bob is off when `prefers-reduced-motion` is set, and it never changes where a tap lands.
- Color follows the Fitzgerald key (green actions, orange things, yellow people). An item with a picture shows the picture, and one without shows its emoji.
- **Dock (v0.7):** Jonatito │ family │ his favourite things (Pongo, Barney) │ All words, My day, Media. Pongo and Barney left the inner orbit (their two spots stay empty); Pongo still plays full screen, Barney still adds "Barney" to the sentence. Pets are no longer in the dock (kept for another use; still on the board's People page). The dock list is `settings.dock_items` (schema v7).
- **Inner orbit: pictures only (v0.6).** The picture (or emoji) fills the whole circle; there is no word under it. The coloured ring still shows the word type. The name is kept for screen readers and is shown and edited by caretakers in Items → Words. Family faces in the outer orbit keep their name tags.
- **Not available:** a busy person gets a yellow ring and a small 12-hour clock of when they're free. An away person is greyed out, with a grey ring and 🚫. *The v0.2 build shows ⏳ for busy, which breaks the "time is always a real clock" principle. v0.3 fixes this.*

### 5.3 What a tap does

| Tapped | What happens |
|---|---|
| Action or thing (`tap = add`) | Speaks its word and adds it to the strip |
| Group item, e.g. **Eat** (`tap = open`) | Speaks "eat", adds it to the strip, and opens its **sub-orbit** (5.4) |
| Person in the outer orbit | Opens their **person screen** straight away (5.6): where they are, their voice notes, TALK and quick messages. Visiting someone does not add them to the sentence |
| **Sound-wave badge** in front of a person | Plays their newest unheard voice message (5.6) |
| Media item, e.g. **Pongo** (`tap = play`) | Opens it **full screen** (5.5). It isn't added to the strip |
| **His own face** (center) | Opens **My body** (5.8) |
| A closed item (time rule) | Speaks "grapes at 3:00" and shows the clock. It isn't added (5.4) |
| Dock: **Me** | Back to the main orbit, from anywhere |
| Dock: a face | That person's **person screen**: where they are, their voice notes, TALK and quick messages (5.6) |

### 5.4 Sub-orbits and time rules (Eat → foods)
- **Opening a sub-orbit.** Jonatito stays in the center. The opened item (🍇 Eat) sits as a small badge on his face, and its children fill the inner orbit in their own fixed slots. The outer orbit (people) stays, so *"Mommy, eat, grapes"* can be built on one screen. Tapping his face or the badge goes back one level.
- **Children** are rows in `items` with `parent_id = 'eat'`. Any item can be a group, and nesting deeper than one level is allowed but not recommended.
- **Time rules (`item_rules`).** A caretaker can make an item open only at certain times, or only a few times a day:
  - `window`: open from `start` to `end` on the given days, or tied to a routine item (for example "snack", open from the snack's start for 45 min);
  - `limit`: at most N per day (from the daily log), then closed until tomorrow, with an optional suggestion (smoothie → water);
  - `interval`: at least N minutes since the last time it was logged.
- **What "closed" looks like.** The item is dimmed with a small 12-hour clock badge. Tapping it speaks "grapes at 3:00" and shows a large clock with the wait shaded. When any snack item is closed, a side panel shows **"next snack"** as a clock face and "3:00". The item is not added to the strip.
- **Principle check.** The plan says reminders never block. Closed items are the one exception, and only a caretaker can set one. They must always show *when*, never just "no". The dispatcher's gentle notes (recent, next meal) still apply to open items.
- **Close or remind, per rule.** Each rule has a `blocks` switch in the item editor: *closed with a clock*, or *reminder only* (the item stays open and the dispatcher shows its gentle note). Migrated daily maximums close; the old "eaten in the last hour" reminder stays a reminder.
- **Where closing applies (v0.3 build).** Closed items are enforced in the orbit. The "All words" board keeps its v0.2 behaviour (everything tappable, gentle notes after sending) while the orbit takes over.

### 5.5 Media items (Pongo) — full screen
- A `tap = play` item links to a `media` row. It opens **full screen**, hiding the Here & Now bar, strip and dock, with no browser chrome (kiosk mode).
- **To leave:** tap his face (top-left, always visible), or wait for the video to end. Either way he returns to the orbit. There is no scrubber and no "next video".
- The media clock (the remaining time shaded on a 12-hour face) sits top-right. The media policy (section 10.2) applies in full: during the **sleep lock** the item shows a moon and the clock of when it wakes, and it doesn't open.
- To *ask* for media instead of playing it, he uses the board or the sentence strip (`[Me] [watch] [Pongo]`).

### 5.6 Person screen: where they are, hear them, talk to them
One screen per person brings together **where they are** (relative to him), **what he can hear from them**, and **how he sends to them**. It replaces the separate close-up and "where is" views from earlier drafts.

**How he gets there:** tap their face in the orbit or in the dock.

```
┌─ Here & Now bar ──────────────────────────────────────────────────────────┐
│  ┌────────── WHERE ──────────┐   (Abuela Pilar)  [clock: free at 4:15]     │
│  │   🕐 their time  ☀️/🌙     │                                             │
│  │        (me 📍)             │   HEAR   (her) 〰️ ➜ (me)                     │
│  │          ╲ ✈️ · · ·        │   [⭐ 〰️] [〰️ •] [〰️ Mon] [〰️ Sun]              │
│  │           (Abuela 📍)      │                                             │
│  └────────────────────────────┘   SEND   (me) ➜ (her)                        │
│   🇵🇪 Lima ✈️   back: 🌙🌙🌙 → 🏠   [ 👂 TALK ] [👀 COME SEE] [✋ HELP] [❤️ LOVE] │
├─ Dock ────────────────────────────────────────────────────────────────────┤
```

- **Where (left).** A large version of the ground/globe (5.7) with **both pins**: him and them, a dotted path between them, and the way to get there (🚗 same city or country, ✈️ another country).
  - **Their time.** If they're in another time zone, a small 12-hour clock shows *their* time with ☀️ or 🌙, so he can see it's night where Abuela is.
  - **"Back in N sleeps."** If they set an *until* date, a row of moons (one per night) ends in 🏠.
  - **Unknown or not shared:** only his pin, and their face with ❔.
- **Who (top right).** Their face with the availability ring. Busy shows a small clock of when they're free; away is greyed with 🚫.
- **Hear (middle right).** The **voice shelf**, one big waveform tile per note:
  - **Pinned comfort clips** (⭐, pinned by a caretaker, e.g. *"Te quiero mucho, mi amor"*) come first and never expire;
  - the rest follow newest first, with a red dot on the ones he hasn't heard.
  - He can play any tile, any time, as often as he wants: the "I just want to hear a familiar voice" use.
  - While a note plays, a sound-wave icon travels along the path **from their pin to his**.
  - The section label is pictures only: *their face* 〰️ ➜ *his face*.
- **Send (bottom right).** Four big buttons, labeled *his face* ➜ *their face*:
  - **👂 TALK** records his voice to them. It's the same raised, gently pulsing ear button as before: record up to 15 s, stop on the next tap or after 2 s of silence, then upload.
  - **👀 COME SEE, ✋ HELP, ❤️ LOVE** send the social messages in one tap. HELP stays urgent-class.
  - After sending, the message icon **travels along the path from his pin to theirs** and lands with 📬✔. Where they are becomes part of the act of sending.
  - If they're busy, the dispatcher's usual card appears (the clock of when they're free, plus people who are free now).
- **Recording (family side).** Every screen of the family app (Android or iPhone) has a round **🎙️** button: tap to record (up to 60 s), tap to stop, listen back, **Send**. The "🎙️ For Jonatito" tab lists what you sent and whether he heard it. Notes are stored in `voice_notes`; voice replies to his messages are saved there too.
- **Arrival on the tablet (v0.6).** A new note **pops up**: the sender's face and a moving sound wave, and it **plays once by itself**. It stays about 6 s after it ends, then fades; it is marked heard and stays on the sender's shelf for replay. Tapping the face opens their person screen; tapping the wave plays it again.
  - *Exception to principle 2 (no auto-playing sound), chosen by the family:* only for new voice notes from the family, and **never during quiet hours** (9 pm–7 am). At night the note waits as a sound-wave badge until he taps it.
  - It never interrupts full-screen media: it waits until he leaves the player. Several notes arrive one after the other.
  - If the tablet's browser refuses to play sound on its own, the pop-up pulses with 👆 until he taps it (30 s).
- **Saved clips (v0.6).** A recording can be given a name ("I'll be right there", "Te quiero mucho"), when it is recorded or later with ✏️. **My clips** (🎙️ For Jonatito tab) lists each recording once, named ones first; **↻ Send again** sends it as a new message (the same sound file, a new `voice_notes` row, so it pops up and plays once again). **🎙️ Voice reply** in the inbox opens the same list: one tap answers his message with a clip, or **🔴 Record new**. Only the person who recorded a clip can name or resend it. `voice_notes.label` (schema v6); `GET /api/voice-notes/mine`, `POST /api/voice-notes/:id/resend`, `POST /api/messages/:id/replies/clip`.
- **Unheard badge elsewhere.** An animated sound-wave badge sits in front of the sender's avatar in the orbit and the dock, with a number dot when there's more than one. Tapping it plays the newest unheard note without leaving the orbit.
- **Rules:**
  - Nothing auto-plays (principle 2).
  - There's no delete on his side. Caretakers can pin, unpin or hide notes.
  - Unpinned notes are kept for 90 days (a setting).
  - Playback uses the fixed child volume.
- **Pets** use the same screen without SEND (they can't receive messages). Their pin is home.

### 5.7 Ground & location
- **At rest.** The bottom edge of the orbit shows the **top of a large blue-and-green sphere** at about 25% opacity, with **one pin (his face) in the middle**. It stays still, so he always sees he's *standing somewhere*.
- **On the person screen** the ground is shown zoomed out until both pins fit (there is no separate pop-up in the orbit):

  | Where they are | What he sees |
  |---|---|
  | same city | neighborhood scale, their pin with their face, 🚗 |
  | same country, another city | country scale, 🚗 or 🚆 |
  | **another country** | the globe, with a dotted arc between the pins and a **✈️ flying along it** |
  | unknown or not shared | only his pin, their face with a ❔ |

- **Rendering.** An SVG **orthographic globe** drawn with `d3-geo` from the `world-atlas` 110m land outline, bundled with the app (about 50 KB, works offline). There are no map tiles and no outside requests. Ocean `#7fb8e6`, land `#8fcf8a`, and no borders or labels on his side.
- **Where people's locations come from.** Each adult sets **"Where I am"** in their app: pick a city from a bundled list (about 5,000 cities), or "use my phone's location", rounded to about 10 km. They can add an optional **until** date ("back Oct 3"). The tablet can then show "back in 3 sleeps". Jonatito's own pin comes from `settings.location`, or from the place he's at.
- **Privacy.** Location is city-level only. The tablet and caretakers can see it; friends can't see each other's. It clears automatically after `until`, and each person can turn it off.

### 5.8 My body & pain scale
- **Tapping his face** in the center opens **My body**: a simple front-view drawing of a child's body with **his own photo as the head**.
- **12 tap zones:** head, eyes, ears, mouth/teeth, throat, chest, tummy, potty area (a caretaker can hide this one), arms, hands, legs, feet. Left and right are recorded but aren't required.
- **Tapping a zone** makes it glow red and speaks it ("tummy"). A **pain scale** slides in: 6 faces from smiling (0) to crying (5), colored green to red, with no numbers or words for him.
  - The faces are **drawn in-house**. Published scales (Wong-Baker FACES®, FPS-R) need permission to use in software.
- **Tapping a face** speaks *"My tummy hurts a lot"* and sends it. The thresholds are settings:
  - level 0: logged only ("no hurt");
  - levels 1–2: a normal message to the caretaker on duty;
  - **levels 3–5: urgent.** It goes to everyone on duty, with escalation (section 6, step 1).
- **Records.** Each report creates a `pain_reports` row plus a log entry (`type = 'pain'`). Family phones show the body drawing with the zone highlighted and the chosen face.
- The always-on **"I hurt"** core button opens this same screen.

### 5.9 Item catalog (database)
**One row for everything Jonatito can interact with:** people, pets, foods, actions, places, feelings, body parts and media.

```sql
CREATE TABLE items (
  id            TEXT PRIMARY KEY,           -- 'eat', 'grapes', 'mommy_joyce', 'pongo'
  category      TEXT NOT NULL CHECK (category IN
                  ('person','pet','food','drink','action','place','feeling','play','media','body','social','urgent','core')),
  kind          TEXT NOT NULL,              -- word type / colour: person|pet|action|thing|desc|social|urgent
  label_en      TEXT NOT NULL,              -- spoken / used in sentences ("take a bath")
  label_es      TEXT NOT NULL,
  short_label   TEXT,                       -- shown under the picture ("Bath")
  emoji         TEXT,                       -- fallback until a picture exists
  tap           TEXT NOT NULL DEFAULT 'add' CHECK (tap IN ('add','open','play','body','none')),
  parent_id     TEXT REFERENCES items(id),  -- lives in this item's sub-orbit; NULL = main orbit / board only
  orbit         TEXT CHECK (orbit IN ('inner','outer')),
  orbit_slot    INTEGER,                    -- fixed; never recomputed
  grid_page     TEXT, grid_row INTEGER, grid_col INTEGER,   -- picture-board position (fixed)
  user_id       INTEGER REFERENCES users(id),               -- the person's account (people only; pets have none)
  media_id      INTEGER REFERENCES media(id),               -- what a 'play' item plays
  badge_color   TEXT,
  log_trackable INTEGER NOT NULL DEFAULT 0,
  alias_of      TEXT REFERENCES items(id),
  is_hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  updated_by    INTEGER REFERENCES users(id),
  UNIQUE (parent_id, orbit, orbit_slot),
  UNIQUE (grid_page, grid_row, grid_col)
);

-- Person details stay in people (relation, species, breed, is_self…), keyed by the same id as the item.
-- Media details stay in media (file, duration, bedtime_ok…); the item carries picture, label and slot.

CREATE TABLE audio_clips (                  -- versioned like images; the newest active clip wins, none = text-to-speech
  id INTEGER PRIMARY KEY, owner_type TEXT NOT NULL,        -- 'item'
  owner_id TEXT NOT NULL, lang TEXT NOT NULL CHECK (lang IN ('en','es')),
  file TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, uploaded_by INTEGER, created_at TEXT NOT NULL
);

CREATE TABLE item_rules (                   -- replaces limits
  id INTEGER PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id),
  kind TEXT NOT NULL CHECK (kind IN ('window','limit','interval')),
  blocks INTEGER NOT NULL DEFAULT 1,        -- 1: closed with a clock in the orbit; 0: only a gentle reminder
  days INTEGER,                             -- bitmask Sun..Sat; NULL = every day
  start_min INTEGER, end_min INTEGER,       -- window, minutes after midnight
  routine_item_id INTEGER REFERENCES schedule_items(id), routine_open_min INTEGER,  -- or: open with a routine item
  max_per_day INTEGER, min_interval_min INTEGER,
  suggest_item_id TEXT REFERENCES items(id)
);

CREATE TABLE voice_notes (
  id INTEGER PRIMARY KEY, from_user_id INTEGER NOT NULL REFERENCES users(id),
  audio_file TEXT NOT NULL, duration_s REAL, created_at TEXT NOT NULL,
  heard_at TEXT, pinned INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'app'        -- app | reply | whatsapp (later)
);

CREATE TABLE locations (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  place_label TEXT NOT NULL, country_code TEXT NOT NULL, tz TEXT NOT NULL,   -- IANA zone, for "their time" on the person screen
  lat REAL NOT NULL, lon REAL NOT NULL,     -- rounded to 0.1° (~10 km)
  source TEXT NOT NULL CHECK (source IN ('manual','phone')), until TEXT, updated_at TEXT NOT NULL
);

CREATE TABLE pain_reports (
  id INTEGER PRIMARY KEY, body_part TEXT NOT NULL, side TEXT, level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 5),
  at TEXT NOT NULL, message_id INTEGER REFERENCES messages(id), handled_by INTEGER, handled_at TEXT
);
```

- **Pictures** keep using `images` (with `owner_type = 'item'`) and its version history. Every item's picture can be replaced and reverted (section 9). The "Eat" item's picture is grapes.
- **Audio.** A caretaker can record or upload the word in each language. If there's no clip, the tablet speaks the label with text-to-speech. Tapping plays the clip, and the sentence reads use the clips where they exist.
- **Migration.** A one-time startup migration copies `symbols` → `items`, the display fields of `people` → `items` (with `user_id` from `users.person_id`), media covers → `items` (`tap = 'play'`), and `limits` → `item_rules`. It then gives inner-orbit slots to Eat, Bath, Toilet, Go, Barney and Pongo in their current order and outer-orbit slots to people by `sort_order`, skipping 12:00 and 6:00. The old tables stay as read-only views for one release.
- **v4 (September 2026):** adds the **Music** item (headphones with a sound wave, orange = a thing) to the first free inner slot, preferring slot 7. Tapping it adds "music" to the sentence. A backup is written first, as for every upgrade.

### 5.10 Item editor (parent mode)
- **Tree view:** Main orbit (inner, outer) → each sub-orbit → board pages → hidden items.
- **For each item:**
  - **Picture:** camera or gallery, plus the history with one-tap revert (section 9). *Not built yet: symbol-library search and the fixed-frame crop.*
  - **Labels:** EN and ES, plus a short label.
  - **Audio, per language:** record in the app (up to 10 s), upload, or use text-to-speech; with preview and revert.
  - **Category and color.**
  - **Tap behavior:** add, open, play or body.
  - **Placement:** a slot picker that shows the fixed orbit slots and board cells.
  - **Links:** the user account (people) or the media file (media).
  - **Time rules.**
  - **Hidden** toggle.
- **Moving an item** to another slot asks for a confirmation (*"He has learned where this is. Move it anyway?"*) and is written to `audit`.
- Every change reaches the tablet live (an SSE `items` event), and the new picture or audio is cached for offline use.

### 5.11 API additions

| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/items` | any | The catalog as a tree, with picture URLs, audio URLs and whether each item is open now |
| `PATCH /api/items/:id` | caretaker | Labels, category, tap behavior, placement, hidden, rules |
| `PUT /api/items/:id/image` · `POST …/image/revert` | caretaker | Replace or revert the picture |
| `PUT /api/items/:id/audio?lang=es` · `DELETE …/audio?lang=es` | caretaker | Replace the audio, or go back to text-to-speech |
| `POST /api/voice-notes` (audio body) | caretaker, friend | Record a voice note for Jonatito |
| `GET /api/voice-notes?from=<person>` · `POST /api/voice-notes/:id/heard` | child | Voice shelf and badges |
| `PATCH /api/voice-notes/:id` | caretaker | Pin, unpin or hide |
| `PUT /api/location` · `GET /api/locations` | adults · child, caretaker | Set your own location · read the pins |
| `POST /api/pain` `{part, side?, level}` | child | Pain report → message + log + dispatch |

New SSE events: `items`, `voice_note`, `location`, `pain`.

### 5.12 Decisions (v0.3 build defaults, all changeable)
1. **Tapping a person in the orbit** opens their person screen straight away (changed September 2026: the globe pop-up step was removed). To address a sentence to someone, he uses the person screen's buttons or the board's People page; a sentence with no person goes to the caretaker on duty.
2. **Location:** each adult sets "Where I am" (city search or phone location, rounded).
3. **Closed items:** each rule chooses *closed with a clock* or *reminder only*; closing applies in the orbit.
4. **Pain:** 0 logged, 1–2 to the caretaker on duty, 3–5 urgent. The potty zone is shown; a caretaker can hide it.
5. **Board:** the "All words" grid stays, as a dock button.

### 5.13 Everything he taps: moments and the caretaker timeline (v0.4)
**Goal:** every tap Jonatito makes is kept, so caretakers can see what he was trying to say, including the sentences he never sent.

- **Tap log.** The tablet records every tap:
  - adding a picture, opening Eat, tapping a closed food, playing a voice note, TALK, the social buttons, My body and pain faces, Pongo, Send, Clear and 🔊.
  - Taps are sent to the server in small batches, and queued while offline.
  - Each tap carries: the time, the item or person, what the tap did, and which screen he was on.
- **Moments.** Taps close together form one **moment** (one intent). A moment ends when:
  - he presses **Send** → outcome *sent* (linked to the message);
  - he presses **Clear** → *cleared*;
  - he stops for **30 s** (a setting) → *not sent*.
  For every moment the server also writes the sentence the pictures would have made ("He may have meant: *Mommy, I want to eat grapes.*"), in English and Spanish.
- **A face tap reaches that person, batched.** When a moment includes a person's face (orbit, dock, board People page) and ends *without* Send, that person gets **"💭 Jonatito tapped your face"**. It includes the rest of what he tapped and the sentence it would have made. It goes through the same batching as messages (5.14), so a burst of taps is one update, not ten.
  - If he does send, the real message arrives instead.
- **No face tapped:** the moment is still logged and shows on the caretakers' timeline. Nobody else is notified.
- **Caretaker timeline** (family app, caretakers only, a new **🕒 Today** tab):
  - **Moments, newest first:** the time, the pictures in the order he tapped them (closed foods dimmed, with their clock), and the outcome: *📬 sent to Mommy Joyce* · *💭 not sent, in Abuela Pilar's next update* · *📝 not sent*.
  - **What he meant:** "He may have meant…", plus context, e.g. *"Grapes were closed: snack at 3:00."*
  - **The rest of his day, in the same list:** pain reports, voice notes he played, media, and the caretakers' own log entries (food, meds).
  - **Filters:** everything · not sent · urgent; plus a day picker.
  - **Answer an unsent moment:** ✅ Yes / ✋ Wait / ❌ Not now turns it into a message and replies. His tablet shows the reply like any other.
- **Privacy:** the tap log is visible to caretakers only. Friends only get the 💭 about their own face. Raw taps are kept for 60 days; moments are kept like messages. Both are included in the parents' data export.

```sql
CREATE TABLE moments (
  id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT,
  outcome TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','sent','cleared','not_sent')),
  tokens TEXT NOT NULL DEFAULT '[]',           -- the strip as it was
  sentence_en TEXT, sentence_es TEXT,          -- what he may have meant
  message_id INTEGER REFERENCES messages(id),  -- when sent, or when a caretaker answered it
  notified TEXT NOT NULL DEFAULT '[]'          -- person ids that got a 💭
);
CREATE TABLE tap_events (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, moment_id INTEGER REFERENCES moments(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id), person_id TEXT REFERENCES people(id),
  action TEXT NOT NULL,   -- add | open | closed | hear | talk | social | body | pain | media | send | clear | say
  screen TEXT NOT NULL,   -- orbit | orbit:eat | board | person | body | player
  detail TEXT             -- JSON, e.g. {"closed_until": "..."} or {"level": 4}
);
```

### 5.14 Text messages and notifications without spam (v0.4)
**Channel:** the El Jonatito app only. WhatsApp is dropped. Phone push notifications (Web Push) come later: v0.4 notifies inside the open app (banner and sound), and push will reuse the same queue.

**Messages are text:**
- **From Jonatito:** his picture sentence arrives as its text ("Abuela Pilar, I want to eat grapes.") with the pictures under it, as today.
- **From the family:** besides ✅ / ✋ / ❌ and voice, a relative can reply with a **short typed message** (up to 120 characters). His tablet reads it aloud (in the tablet's language setting) and shows it next to their face.

**Batching: at most one notification per person every 10 minutes.**
- **The inbox is always live.** Every message appears there as it happens. Only the *notification* (banner, sound, later a push) is batched.
- **First one through, then a digest.** The first message after a quiet spell notifies right away, so a real request is never delayed. Anything else for that person in the next **10 minutes** (a setting) is held, then delivered as **one update**: "📬 Jonatito · 3 more: grapes ×2, 💭 tapped your face".
- **Repeats collapse:** the same sentence three times shows once, with ×3.
- **💭 face taps never notify on their own.** They only ride along in the next update.
- **Quiet hours** (9 pm–7 am): nothing buzzes. Held items arrive as one morning update, and the inbox still has them.
- **Never batched:** urgent messages (HELP, I hurt, pain 3–5) and the future **panic button** (5.15). They skip the batching and quiet hours.
- **Caretakers** don't get a notification per tap. The tap log is for the 🕒 Today timeline (5.13), which they open when they want it.
- **Per-person settings** (family app → 🔔): the batch window (off / 5 / 10 / 30 min); whether 💭 face taps are included in updates or left out; urgent is always on.

```sql
CREATE TABLE notify_queue (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('message','face','reply','urgent','panic')),
  message_id INTEGER REFERENCES messages(id), moment_id INTEGER REFERENCES moments(id),
  summary TEXT NOT NULL,                       -- one line: the sentence, or "tapped your face"
  created_at TEXT NOT NULL, delivered_at TEXT, batch_id INTEGER
);
CREATE TABLE notify_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  batch_min INTEGER NOT NULL DEFAULT 10,       -- 0 = every message notifies
  face_taps INTEGER NOT NULL DEFAULT 1         -- include 💭 in updates
);
```
A small job runs every minute. It delivers each person's held items once their window has passed (outside quiet hours), as one `notify` event over the existing live connection. Later, the same step sends the push.

**API additions (v0.4):**

| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/taps` `[{at, item_id?, person_id?, action, screen, detail?}]` | child | Tap log (batched); the server groups taps into moments |
| `GET /api/moments?day=` | caretaker | The 🕒 Today timeline (moments + pain + voice plays + media + log) |
| `POST /api/moments/:id/answer` `{kind}` | caretaker | Turn an unsent moment into a message and reply to it |
| `POST /api/messages/:id/replies` `{kind: 'text', text}` | caretaker, friend | Typed reply (read aloud on the tablet) |
| `GET/PUT /api/notify-prefs` | adults | Batch window and 💭 setting |

### 5.15 Panic button (later)
- **What he sees:** a dedicated, always-visible **SOS** on the tablet, separate from the HELP word. It is big, red, and needs a **1-second hold** so a passing tap doesn't set it off.
- **Who it reaches:** **everyone:** every caretaker *and* every friend, not only the caretakers on duty. It skips batching, quiet hours and availability.
- **On every family phone:** a full-screen alert with his photo, the time, and where the tablet is (home, or a place he's at), plus **"I'm on it"**. The first "I'm on it" is shown to everyone else, and on his tablet as that person's face with a 12-hour clock of when they answered.
- **If nobody answers in 2 minutes:** it repeats to everyone. Once push exists, it also goes out as a push with sound that can't be silenced from the app.
- Logged on the 🕒 Today timeline, and it can't be deleted.
- The `urgent` path already built (HELP, I hurt, pain 3–5 → the caretakers on duty) stays as it is. The panic button is the "everyone, now" level above it.

### 5.16 Decisions to confirm (v0.4)
1. **Batch window:** 10 minutes by default. First message immediately, the rest as one update?
2. **💭 face taps:** only inside updates (never their own notification). OK?
3. **Typed replies from the family,** read aloud on his tablet. Wanted?
4. **Moment length:** does ending a moment after 30 seconds of no taps suit how fast he taps?
5. **Tap history:** is keeping 60 days of raw taps OK?

### 5.17 Living orbit: sky, earth and a timeline he can scrub (v0.5)
**Goal:** the main screen shows time passing without words. The earth turns under him, and the sun and moon travel around it. The sky follows the weather and the season. He can drag time back to see what happened, and forward to see what is coming.

**Layout change**
- **Rows:** the **sentence row moves to the top**; the **time row** (clock, timeline, day/season/weather/place) sits under it.
- **Centered NOW:** the clock block and the chip block have the same width, so the timeline is centered on the screen. The **NOW line is fixed in the center**, in line with his head, and a faint dashed guide runs from it down to his face.
- **The timeline moves, not the marker:** past to the left, future to the right, about 1 px per minute (±5 hours visible). Night hours are shaded; each midnight shows the day's colour dot.

**The sky (main area background)**
- **Earth:** a large sphere peeking from the bottom, with an atmosphere glow. It turns once per day of timeline time, plus a very slow idle drift, so it is never completely still. Land colours follow the season: green spring with pink blossom, green summer, green and orange autumn, white winter.
- **Sun and moon:** they travel an ellipse around the earth. The sun rises at the left edge at 6:00, is overhead at noon, and sets on the right at 18:00; the moon is always opposite. Symbolic, not astronomical.
- **Sky colour:** follows the sun's height: day blue → dusk orange → night blue with a few stars.
- **Weather:** clouds (how many depends on the forecast), rain streaks, snowflakes, and a few falling leaves in autumn. It's all low detail, and nothing flashes.

**Rendering decision: Canvas 2D background + DOM on top**

| | Canvas 2D (chosen) | SVG | WebGL |
|---|---|---|---|
| Smooth continuous motion | ✅ one redraw per frame | ⚠️ every moving node is repainted by the browser | ✅ |
| Memory | one bitmap (~2–4 MB at 1280×424, ×2 on retina) + one cached land strip | grows with the number of nodes | GPU context + buffers; context loss on cheap tablets |
| Scrubbing time | trivial: `drawSky(ctx, time, weather, season)` is a pure function of time | re-computing many attributes | shaders, more code |
| Battery / old tablets | good at a 30 fps cap | fine at low detail | worst |

- Only the **sky** is a canvas. Everything he taps (items, people, his face, the strip) stays as DOM on top: big touch targets, screen readers and the existing tests keep working.
- **Budget:** at most **30 fps**, with `devicePixelRatio` capped at 2. The earth's land is drawn once per season into an offscreen strip and slid sideways. There are no images, filters or blur, apart from two radial gradients (sun glow, atmosphere). In the mockup a full redraw costs about 0.05 ms.
- **When it stops or slows:**
  - it **pauses** while the tab is hidden, or when another screen covers the orbit;
  - in **reduced-motion** mode it redraws once a minute (sun and moon still move with the clock; clouds stop);
  - it drops to **10 fps** after 2 minutes without a touch.

**Scrubbing time**
- **Dragging the timeline** (or the NOW area) moves the time under the NOW line. The clock face, digital time, day, sky, sun, moon and earth all follow. The clock shades the span between real now and the dragged time.
- **The orbit dims while away from NOW:** he cannot act in the past or the future. His face stays bright; **tapping it, the clock or NOW returns to now**. It also springs back by itself 8 s after the last touch.
- **Left (past), from real data:** his moments (5.13) as small pictures with the person's face; messages sent and answered; voice notes he played; media he watched; pain reports; food logged by caretakers; and **photos caretakers attached to a past time**. Tapping one opens it big (photo, or replay the voice note).
- **Right (future): only what is scheduled.** The routine plus **calendar events** caretakers add, with a picture and the faces of the people involved, e.g. "Dentist with Mommy Joyce", "Abuela Pilar comes home ✈️".
- **Range:** 3 days back and 7 days forward.

**Calendar (caretakers)**
- **📅 Calendar tab:** add an event with a picture (camera, gallery or emoji), a time, a repeat rule, the people involved, and when it starts showing on his timeline (e.g. from the day before).
- **"Add a photo to his day":** put a photo at a past time; it shows on the past side.
- The routine becomes repeating events. Google Calendar can feed the same table later (section 8).

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT,
  rrule TEXT,                                   -- e.g. FREQ=DAILY for the routine
  title TEXT NOT NULL, emoji TEXT, item_id TEXT REFERENCES items(id),
  person_ids TEXT NOT NULL DEFAULT '[]', show_from_min INTEGER NOT NULL DEFAULT 1440,
  kind TEXT NOT NULL DEFAULT 'event' CHECK (kind IN ('event','routine','photo')),
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
);
-- pictures: images.owner_type 'event'
```

| Method & path | Role | Purpose |
|---|---|---|
| `GET /api/timeline?from=&to=` | child, caretaker | Past items (moments, voice plays, media, pain, logs, photos) + future events in one list |
| `GET/POST /api/calendar` · `PATCH/DELETE /api/calendar/:id` · `PUT /api/calendar/:id/image` | caretaker | Calendar and photos on his day (`/api/events` is the live-update stream) |

> **Build status (v0.4 + v0.5, September 2026):** built with the defaults above (10-min batching, 💭 only inside updates, 30 s moments, typed replies, ±3/7 days, 8 s spring back, caretakers add photos). Not built yet: push to locked phones and the panic button (5.14–5.15); the routine stays in `schedule_items` rather than repeating events; 💭 on their own wait an hour before they are delivered without a message to carry them.

### 5.18 Decisions to confirm (v0.5)
1. **Scrub range:** 3 days back, 7 days forward?
2. **Spring back:** 8 seconds after the last touch, or only when he taps his face?
3. **Photos on the past side:** caretakers only, or can friends add photos to his day too, with a caretaker approving them?
4. **Night look:** is a dark night sky OK for him, or should night stay light and calm (only a moon and stars)?

### 5.19 Places compass: relative space on the earth (v0.8, built)
> **Built (September 2026), as chosen in review (mockup tab "🌍 Places on the earth"):** drawn **on a bigger earth** (it rises higher and curves more) instead of a separate band. **People leave the orbit entirely**: they are in the taskbar and appear as **small faces on the globe** where they are; the orbit keeps only the inner ring. **Home = NYC** (the family's home location setting). **No generic place icons** for now (no cart, park, school…): only 🏠 home and people. **Pets** (Lexi, Loki, Logan) appear as small pictures next to 🏠 HOME (not tappable). **Taskbar badges:** each family face shows what is waiting: a moving sound wave with a count for unheard voice notes, 💬 for an unread typed reply. The orbit holds only his inner items (Eat, Bath, Toilet, Go, Music, Water); Pongo and Barney are in the taskbar. Busy / away marks moved from the orbit to the taskbar faces (a small 12-hour clock of when they are free, or 🚫). Opening someone's page from the taskbar or the globe counts as a visit (💭). Schema v8 clears the outer orbit. Not built yet: family places with coordinates, "Jonatito is at…", the compass following the timeline. The notes below describe the fuller design; places can be added later.

**Goal:** the timeline shows *when*; this strip shows *where*. Home (or wherever he is) sits in the middle, under his head. Near things are near the middle; far things go to the edges.

**Layout:** a band between the earth and the dock, the full width of the screen (about 90 px).
- **Center:** 🏠 **HOME**, or the place he is at now (🏫 at school, 🏡 at Abuela's). It has a red frame, like his pin.
- **Zones, outward from the center:**
  - **walk:** under 2 km, the lightest green;
  - **🚗 line**, then **drive:** 2–150 km;
  - **✈️ line**, then **fly:** over 150 km, reaching the edges.
- **Scale:** squeezed, not to scale. Inside the walk zone the position grows with distance; the drive zone uses a log scale; the fly zone bunches far places near the edges. Anything nearby gets most of the room.
- **Side:** west on the left, east on the right, by rough compass direction, so each place is always on the same side.
- **Crowding:** pictures sit on two rows. When a spot is taken on both, a picture is nudged outward, away from home, never across the center.

**What appears on it:**
- **Places:** the Places words (park, school, store, pool, Abuela's house…), each with a location set by a caretaker.
- **People:** each adult's "Where I am" pin (5.7). If they chose one of the family places ("I'm at the doctor"), their face sits on that place's picture instead.
- **Not shown:** people who haven't shared where they are.

**Taps:**
- **a place:** adds its word to the sentence ("I want to go to the park");
- **a face:** opens their person screen;
- **HOME:** says "home" and adds it.

**Caretakers:**
- **Items → a place → Location:** "Set to where this phone is now", or search a city or address. Stored to about 100 m, visible to caretakers and the tablet only.
- **"Jonatito is at…":** a quick setting on the family app. It moves the center of the compass, and calendar events with a place can set it automatically.
- **"Where I am":** gains quick buttons for the family places ("At home", "At the doctor").

**Rendering:** plain DOM (a dozen elements, no canvas). It updates on the `location` and `items` events.

**Screen space:** on a 1280×800 tablet the strip takes about 90 px from the orbit. Alternative: draw the strip **on the earth itself** (the land band already there), so the orbit keeps its space.

```sql
CREATE TABLE places (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  lat REAL NOT NULL, lon REAL NOT NULL, set_by INTEGER REFERENCES users(id), updated_at TEXT NOT NULL);
-- settings.current_place = item id (default 'home'); locations.place_item_id = optional family place for "I'm at …"
```

### 5.20 Decisions to confirm (v0.8)
1. **Position:** a separate band under the earth (as mocked), or drawn **on** the earth band to keep orbit space?
2. **Side:** west/east by real direction, or simply alternate left/right?
3. **Which places:** only places with a location set, or also the other Places words (shown at the edge of the walk zone until a location is set)?
4. **Timeline link:** when he drags time, should the compass move too (e.g. show him at school at 10:00 from the calendar)?

---

## 6. Smart dispatcher (worker)

Triggered by the PocketBase realtime subscription on `messages` create.

```ts
async function dispatch(msg: Message) {
  const now = new Date();
  const notes: Note[] = [];

  // 1. Urgent bypass
  if (msg.priority === 'urgent') {
    const onDuty = await caretakersOnDuty(now);                 // from gcal "duty" events + availability
    await notifyAll(onDuty, msg, { sound: 'alarm' });
    scheduleEscalation(msg, { afterMin: 3, via: ['whatsapp', 'sms'], to: allCaretakers });
    return finalize(msg, 'delivered', notes);
  }

  // 2. Context hints for the child (shown on the tablet, never block)
  for (const s of foodOrDrinkSymbols(msg.tokens)) {
    const last = await lastLog(s.id);
    if (last) notes.push({ kind: 'recent', symbol: s.id, minutesAgo: diffMin(now, last.at) });
    const lim = await limitFor(s.id);
    if (lim && (await countToday(s.id)) >= lim.max_per_day)
      notes.push({ kind: 'limit', symbol: s.id, suggest: lim.suggest_symbol });
  }
  const next = await nextScheduleItem(now);
  if (next && diffMin(next.start, now) <= 20) notes.push({ kind: 'upcoming', item: next.id });

  // 3. Recipient availability
  const target = msg.to ?? (await primaryCaretakerOnDuty(now));
  const avail = await availabilityOf(target, now);              // manual status overrides gcal freeBusy
  if (avail.status !== 'available') {
    notes.push({ kind: 'busy', person: target, until: avail.until,
                 alternatives: await availablePeople(now) });
    await queueForLater(msg, target, avail.until);              // still delivered (silently) now
  }

  // 4. Quiet hours
  if (inQuietHours(now) && !isCaretakerOnDuty(target, now)) redirectTo(msg, await primaryCaretakerOnDuty(now));

  await notify(target, msg, { channel: bestChannel(target) }); // push → WhatsApp fallback if no push sub
  return finalize(msg, 'delivered', notes);                     // notes stream back to tablet via realtime
}
```

**Sentence rendering:** a small rules-based grammar per language (subject/verb/object slots from the Fitzgerald categories). For example `[Abuelo][uvas][comer]` → *"Abuelo, quiero comer uvas."* An LLM call is **not** required. It could be added later for richer phrasing, with the output checked against the tokens.

---

## 7. Front-end structure

```
apps/
  web/                         # single React PWA, routes by role
    src/
      app/                     # routing, providers, service worker registration
      features/
        here-now/              # clock, timeline, sun arc, season, weather, location
        orbit/                 # v0.3 home: fixed-slot orbits, sub-orbits, time rules (section 5)
        ground/                # blue-green sphere, pins, zoom-out with ✈️
        body/                  # My body + pain scale
        voice-shelf/           # sound-wave badges, per-person voice notes
        me-button/
        people-bar/            # avatars, availability rings, face hotspots
        sentence/              # strip, grammar, TTS, send
        board/                 # fixed grid, categories, motor-plan layout ("All words" from the dock)
        dispatcher-feedback/   # busy/recent/limit cards with 12-hour clock faces
        log/                   # plate & glass visuals, caretaker entry
        schedule/              # first/then, timeline data
        media/                 # movies, jukebox, favorite moments, sensory games, media clock, sleep lock
        pictures/              # change-picture flow: camera, crop, background removal, history
        calls/                 # LiveKit audio, voice notes
        parent/                # PIN gate, vocab/people/rules editors, insights
        friend/                # inbox, quick replies, status, calendar link
      lib/ pb.ts tts.ts audio.ts outbox.ts time.ts season.ts
  worker/                      # Node dispatcher + integrations
infra/
  docker-compose.yml  Caddyfile  livekit.yaml  cloudflared/config.yml
```

**Time display component (`<Clock12>`):** one shared component for every time shown to Jonatito. It draws a 12-hour analog face (ticks; numbers 12/3/6/9 at large sizes) with hands at the target time. The span between now and the target is shaded: on the minute scale for waits up to 60 min, on the hour scale for longer ones. Digits use 12-hour format ("3:15", with am/pm only in adult screens where it's ambiguous). No hourglass or generic time icons anywhere in child mode.

**Performance targets:** tap → spoken feedback in **< 100 ms** (text-to-speech runs locally, never waits on the network). Cold start **< 2 s** from cache. Works on a 3-year-old mid-range tablet.

---

## 8. Integrations detail

### Google Calendar
- Create two calendars: **"Jonatito — Family"** (availability/duty) and **"Jonatito — Day"** (routine).
- Worker authenticates with a **Google Cloud service account** that the family shares both calendars with ("Make changes to events" for the Day calendar, "See all event details" for the Family calendar).
- Convention: in the Family calendar, event title `DUTY: Mamá` = on duty. Any other event on a person's color/attendee = busy.
- Sync every 5 min + `events.watch` push channel. Cache in `schedule_items` / `availability` so the tablet works offline.

### Weather & season
- `GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=auto` every 15 min.
- Season is computed locally from the date and hemisphere (meteorological seasons).
- The weather code maps to a symbol and a "what to wear" hint.

### Notifications
- **Web Push:** VAPID keys in `.env`. Each family phone subscribes when installing the web app. iOS requires the web app to be **added to the Home Screen** (iOS 16.4+).
- **WhatsApp:** *not used (decided September 2026: the app is the only channel; see 5.14).*
- **FaceTime / WhatsApp calls:** no API. Friend and parent screens show `facetime-audio://<contact>` and `https://wa.me/<number>` deep links.

### Audio
- **Voice notes (child side, no microphone/play icons):** tapping a person's **ear** zone (labeled **TALK**, styled as a raised pressable button with a gentle "tap me" pulse) starts `MediaRecorder`. It records up to 15 s, stops on the next tap or after 2 s of silence, then uploads to `messages.audio`. The ear pulses red with a live waveform while recording. Tapping the **sound-signal** zone (labeled **LISTEN**, a waveform graphic that replaces the mouth) plays that person's **last recorded message**, or else their default `voice_clip_hello`. The waveform bars animate while it plays; later they'll be driven by the real audio levels (Web Audio `AnalyserNode`).
- **Voice notes (family side):** a normal hold-to-record button in friend mode → `replies.audio`.
- **Live calls:** worker issues LiveKit access tokens (room = `call-<uuid>`). Audio-only by default. The tablet auto-answers **only** calls from caretakers (setting), with a 3-second "ringing" picture of who is calling.
- Self-hosted LiveKit needs UDP 50000–60000 + TCP 7881 forwarded on the router (Cloudflare Tunnel does not carry WebRTC media). If that's a problem, use **LiveKit Cloud** (free tier) and keep everything else at home.

---

## 9. Custom pictures (admin)

**Every picture in the app can be replaced with a real photo** by anyone with admin (caretaker) access. That covers people's avatars, Jonatito's own "Me" face, places (home, school, Abuela's house, the park), things (his cup, his grapes, his favorite train), and media covers.

**How it works for the admin:**
1. In parent mode, long-press any symbol, avatar or place and choose **"Change picture"**.
2. Take a photo with the phone or tablet camera, pick one from the gallery, or choose from the symbol library (ARASAAC/Mulberry search built in).
3. Crop in a **fixed frame** (circle for people, rounded square for things). Optional **background removal** so the object stands out cleanly.
4. Preview it exactly as Jonatito will see it, then **Save**. The tablet updates within seconds through realtime sync, and the new image is cached for offline use.

**Rules that protect his motor planning:**
- A new picture **replaces the image only**. The symbol keeps its position, color border, label and sound.
- The previous version is kept in `images` history, and **"Revert"** is one tap.
- **Optional "gentle introduction":** for a few days, show the new photo with the old symbol small in the corner, then retire the old symbol automatically.
- Friends and family can **suggest** a photo (for example Abuela Pilar sends a new selfie). It waits for admin approval before it appears.

**Technical notes:**
- Front-end: `<input type="file" accept="image/*" capture="environment">` for the camera. `react-easy-crop` for the fixed-ratio crop. Optional background removal on the device with `@imgly/background-removal` (runs in the browser via WASM, so no uploads to third parties).
- The worker makes 3 sizes (128/256/512 px, WebP + JPEG fallback) with `sharp` and strips EXIF/GPS metadata.
- Images are stored in PocketBase file storage, with a new file name for every version, so Cloudflare and the service worker never serve a stale picture.

---

## 10. Entertainment & local media library

Entertainment is a reward, a comfort and a way to regulate. It's also a big reason he'll want to use the tablet at all. Everything is **stored locally**, curated by the family, and works without internet.

### 9.1 What's in it
- **My movies & shows:** big poster tiles. **"Keep watching"** remembers where he stopped.
- **Favorite moments:** parents bookmark the scenes he loves (a train crossing a bridge, a song in a film) as short loops he can replay on their own. Many autistic kids rewatch specific moments, and this makes it easy and safe.
- **Jukebox:** favorite songs as large album-art buttons. Tapping a song plays it; there's no small print to read. **Playlists linked to routines:** bath songs 🛁, car songs 🚗, calm songs 🧘, bedtime lullabies 🌙.
- **Family channel:** photo slideshows and short videos sent by relatives (after approval), such as "Abuelo says hi from the beach".
- **Sensory & cause-and-effect play:** pop bubbles, tap a piano/drum pad, fireworks, a fish tank, and color mixing. Built in, offline, with no ads and no in-app purchases.
- **Social stories:** picture stories for the dentist, a haircut, or a trip, in the same player.
- **Asking for media through the sentence builder:** `[Me] [watch] [Trains]` works like any other message. The app plays it if media time is open, or answers visually ("after dinner 🍲").

### 9.2 Time & sleep rules (`media_policy`)
- **Daily budget and per-session limit** shown on the same 12-hour clock face every time (remaining time shaded, end time underneath), plus a gentle warning 2 minutes before the end. At zero the video **fades out** and never cuts off hard mid-scene. The player finishes the current song or scene, up to 60 s.
- **Sleep lock:** from bedtime (for example 8:30 pm) until wake-up (for example 7:00 am), movies, shows and games are locked. The media button shows a **sleeping moon** 🌙 and a clock picture of when media "wakes up".
  - **Wind-down** (the 30 min before bedtime): only the calm playlist and the bedtime story are available, with the screen dimmed and warmer colors.
  - **During sleep hours:** only the **bedtime playlist** (lullabies, white noise, rain) with a sleep timer that fades the volume to zero.
  - The schedule controls this, so a birthday party night can be extended with a single calendar event.
- **Caretaker override:** "+15 min" from parent mode or friend mode (logged).
- **Enforcement happens on the server**, not just in the app: during locked hours media URLs return `423 Locked`, and signed URLs expire. Clearing the browser cache can't get around it.
- All viewing is logged to `media_sessions`, so parents can see patterns (what calms him, what excites him before bed).

### 9.3 Storage & playback
- **Library location:** `/srv/media` on the home server's SSD (plan on 1–2 TB for a large collection; an external USB drive works).
- **Ingest:** parents drop files into a watched folder (`/srv/media/inbox`) or upload through parent mode. The worker runs **ffmpeg** to normalize everything:
  - video → H.264/AAC MP4 at 720p with fast start (plays on every tablet)
  - audio → AAC 256 kbps or Opus
  - volume levels evened out (loudnorm) so no track is shockingly louder than the others
  - poster/album art extracted automatically, replaceable like any other picture (section 9)
- **Playback:** Caddy serves files with HTTP range requests (seeking works). For very large libraries, **Jellyfin** can run alongside as an optional back end, with the Jonatito player still in front so the UI stays simple.
- **Offline favorites:** items marked `pin_offline` download to the tablet's browser storage (the Cache API or the Origin Private File System). A 64–128 GB tablet can hold many movies and songs, so favorites play in the car, at Abuela's, or when the internet is down.
- Use content the family owns. Rip DVDs and CDs you own, or buy DRM-free downloads. Streaming services (Netflix, Disney+) can't be stored locally because of copy protection. At most they could open as a separate app, and doing that would break the kiosk lock. They're not recommended for his tablet.

---

## 11. Future version: live status & mood awareness

**Goal:** help the family understand how Jonatito is doing right now (calm, active, upset, tired, asleep), so the app and the adults can respond sooner. For example: offer the break screen, alert the on-duty caretaker, or hold back non-urgent notifications.

### 10.1 Possible inputs (all opt-in, chosen by the parents)
| Input | What it gives | Notes |
|---|---|---|
| Tablet camera (front) | Presence, activity level, pose (rocking, covering ears) | Processed **on the device**; no video leaves the tablet |
| Tablet / room microphone | Sound events: crying, laughing, screaming, humming, silence | Small audio classifier (YAMNet-style) on the device or home server |
| Room camera (optional) | Asleep/awake, in room / left room | Local camera over RTSP to the home server, never cloud-connected |
| Smartwatch / band | Heart rate, movement, sleep | Needs a small native companion app or a vendor API (Fitbit/Garmin); a web app can't read Apple Health or Health Connect directly |
| App usage itself | Tap speed, repeated taps, what he's asking for, time since last meal/sleep | Already available and very informative |

### 10.2 How it works
- Models run **locally**: MediaPipe (pose/face landmarks) in the browser, an audio classifier on the home server. Only **derived signals** are stored (`status_signals`), for example `{kind: audio_event, value: crying, confidence: 0.82}`. Raw audio and video are thrown away unless a parent explicitly saves a clip.
- A **status engine** combines the signals with context (the log, the schedule, the time since his last meal) into a simple status: 😴 asleep · 🙂 calm · 🏃 active · 😟 unsettled · 🆘 distressed.
- **Status is a suggestion for adults, not a label for him.** The tablet never tells him "you are angry". It can *offer* things: "Want a break? 🧘" / "Want music? 🎵".
- Caretakers can **confirm or correct** the status from their phone ("actually he's just excited"). Each correction improves his personal baseline.
- Actions it can trigger (all configurable): alert the on-duty caretaker on 🆘, quiet the tablet, delay non-urgent family notifications while he sleeps, and add mood entries to the daily log automatically.

### 10.3 Cautions
- **Facial emotion recognition is unreliable in general, and especially for autistic people**, whose expressions may not match typical patterns. Use it as a weak signal at most. Behavior, sound, heart rate and the family's own knowledge carry more weight.
- It's continuous monitoring of a minor. It needs a clear written policy agreed by the parents: what's collected, where it goes, how long it's kept, and an obvious **"privacy off"** switch (a physical camera cover on the tablet is a good idea).
- Start with the least intrusive inputs (app usage + sound events) and add cameras only if they prove useful.

---

## 12. Future version: understanding Jonatito's own speech

**Goal:** Jonatito may make sounds or word approximations that his family understands but strangers don't. The app will learn **his unique spoken language**, recognize it, show what he said as pictures, and speak it aloud in **English and Spanish**, with more languages later.

### 11.1 Approach in stages
1. **Collect & label (starts early, even in Phase 2).**
   - A **"What did he say?"** button in parent mode and friend mode records the last ~5 s from the tablet (it's always buffering in memory while enabled; nothing is stored unless the button is pressed). The adult tags the clip with a symbol.
   - **Automatic pairing:** when he makes a sound and then taps a symbol within a few seconds, the clip is saved as a *weak* label for that symbol.
   - The target is **20–50 examples per word/sound** for his most common 30–50 meanings.
2. **Personal sound recognizer (v1).**
   - Take a pretrained speech model's encoder (for example **WavLM**, **wav2vec 2.0**, or the **Whisper** encoder), turn each clip into an embedding, and train a **small classifier** over his labeled sounds. This works with small amounts of data and trains in minutes on the home server's CPU.
   - Output: the most likely **symbols** with confidence scores.
3. **Personalized speech model (v2).**
   - Once there are hundreds of labeled clips, fine-tune a multilingual speech model (for example Whisper small with LoRA adapters) on his voice, to handle short multi-word combinations.
   - Training runs occasionally on a PC with a GPU or a rented cloud GPU. Only the resulting model comes home.

### 11.2 From his sound to English and Spanish
- The recognizer outputs **symbols, not text**. Recognized symbols go into the same sentence strip and grammar renderer as taps, so translation is automatic: every symbol already has `labels {es, en, …}`, and the grammar renderer has a rule set per language.
- Adding a language later = adding labels + a grammar rule set + a text-to-speech voice. No retraining needed.
- Free-form speech (beyond his vocabulary) can later go through a normal speech-to-text + translation step for the adults' benefit, clearly marked as uncertain.

### 11.3 Confirming before speaking for him
- **High confidence:** the symbols appear in the strip with a soft glow. He taps ✔ (or just Send) to confirm.
- **Medium confidence:** the **top 3 guesses** appear as big pictures, and he taps the right one. That tap becomes a new training label.
- **Low confidence:** nothing happens (no "I didn't understand you" message, which would feel like failure). The clip can be labeled later by an adult.
- The app never sends a message on his behalf from voice alone until the family decides accuracy is good enough.

### 11.4 Technical notes
- Voice activity detection on the device (Silero VAD or WebRTC VAD in WASM) captures only when he vocalizes.
- Inference runs on the home server (ONNX Runtime). A small classifier could later run fully on the tablet.
- Precedent: Google's **Project Relate** and **Project Euphonia** work on personalized recognition for atypical speech. Their published approach (personal fine-tuning from a few hundred phrases) supports this plan.
- **Consent & privacy:** his voice recordings are biometric data about a minor. Store them only on the home server, encrypted in backups, deletable anytime, and never used to train anyone else's model.
- **Speech therapist involvement is essential**, both to label meanings correctly and so the tool supports, rather than replaces, his speech therapy goals.

---

## 13. Security & privacy

- All traffic is HTTPS (Cloudflare edge + Tunnel).
- **Cloudflare Access** in front of `/_/` (PocketBase admin) and the parent routes: only family Google accounts get in.
- Child tablet: long-lived device token scoped to the `child` role. It can't read other people's data beyond what the board needs.
- Parent mode: hidden gesture + 6-digit PIN (hashed, rate-limited). Auto-exits after 2 min idle.
- No third-party analytics or ads. Usage insights are computed locally.
- Nightly **encrypted** backups (Litestream → R2/B2; restic for uploaded media). Test a restore quarterly.
- Data export/delete available to parents.
- Uploaded photos have EXIF/GPS metadata removed.
- Location (section 5.7) is city-level only, visible to the tablet and caretakers, cleared after its `until` date, and can be turned off by each person.
- Pain reports (section 5.8) are health data: caretakers only, included in the parents' export, never sent to third parties.
- Voice recordings and status signals (sections 11–12) have their own consent switch, retention period and "delete all" button.

---

## 14. Getting it running

### Prerequisites
- A mini PC or Raspberry Pi 5 running Ubuntu Server 24.04 (or Windows with WSL2 + Docker Desktop).
- A domain name added to a free Cloudflare account.
- A Google Cloud project (Calendar API enabled, service account key).
- Node 22 + pnpm on the development machine.

### Steps
```bash
# 1. Server basics
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
git clone <repo> jonatito && cd jonatito

# 2. Configure
cp .env.example .env     # set: PB_ADMIN_EMAIL, VAPID_PUBLIC/PRIVATE (npx web-push generate-vapid-keys),
                         # GOOGLE_SA_JSON, GCAL_FAMILY_ID, GCAL_DAY_ID, LAT, LON, TZ,
                         # LIVEKIT_API_KEY/SECRET, WHATSAPP_TOKEN (optional), B2/R2 keys

# 3. Build the web app
pnpm install && pnpm --filter web build          # outputs apps/web/dist

# 4. Start everything
docker compose up -d                              # caddy, pocketbase, worker, livekit, litestream

# 5. Expose publicly (no router ports needed for the app itself)
cloudflared tunnel login
cloudflared tunnel create jonatito
cloudflared tunnel route dns jonatito jonatito.yourdomain.com
docker compose --profile tunnel up -d             # runs cloudflared with infra/cloudflared/config.yml

# 6. First-run setup
#   open https://jonatito.yourdomain.com/_/  → create admin, import schema (pb_migrations run automatically)
#   open https://jonatito.yourdomain.com/parent → add people, photos, starter vocabulary, schedule
#   on the tablet: open /child, sign in with the device code, "Add to Home Screen", enable kiosk
```

### docker-compose.yml (sketch)
```yaml
services:
  caddy:
    image: caddy:2
    volumes: [./infra/Caddyfile:/etc/caddy/Caddyfile, ./apps/web/dist:/srv/web, /srv/media/library:/srv/media:ro]
    ports: ["8080:80"]
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    volumes: [./data/pb:/pb_data, ./pb_migrations:/pb_migrations]
  worker:
    build: ./apps/worker            # includes ffmpeg + sharp for media/image processing
    env_file: .env
    volumes: [/srv/media:/srv/media]  # inbox/ → library/
    depends_on: [pocketbase]
  # jellyfin:                        # optional, for very large libraries
  #   image: jellyfin/jellyfin:latest
  #   volumes: [/srv/media/library:/media:ro, ./data/jellyfin:/config]
  # voice:                           # future (section 12): ONNX speech recognizer
  #   build: ./apps/voice
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    volumes: [./infra/livekit.yaml:/etc/livekit.yaml]
    network_mode: host
  litestream:
    image: litestream/litestream:latest
    command: replicate
    volumes: [./data/pb:/data, ./infra/litestream.yml:/etc/litestream.yml]
    env_file: .env
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run jonatito
    volumes: [./infra/cloudflared:/etc/cloudflared]
    profiles: [tunnel]
```

### Caddyfile (sketch)
```
:80 {
  handle /api/* { reverse_proxy pocketbase:8090 }
  handle /_/*   { reverse_proxy pocketbase:8090 }
  handle /jobs/* { reverse_proxy worker:3000 }
  handle /media/* {
    forward_auth worker:3000 { uri /media-auth }   # enforces media time & sleep lock (423 when locked)
    root * /srv
    file_server
  }
  handle {
    root * /srv/web
    try_files {path} /index.html
    header /assets/* Cache-Control "public, max-age=31536000, immutable"
    file_server
  }
}
```

---

## 15. Testing & quality

- **Unit tests:** grammar renderer, season/time helpers, dispatcher rules (Vitest).
- **E2E:** Playwright on tablet (1280×800) and phone viewports: build sentence → send → friend receives → reply → tablet shows it.
- **Accessibility:** axe-core in CI. Touch targets ≥ 80 px. Honors `prefers-reduced-motion`. Color never the only signal.
- **Field testing:** every release goes to the tablet in "pilot" mode for 3 days with a caretaker observing before it becomes the default. Keep one-tap rollback (previous build kept in the service worker).

---

## 16. Rough budget

| Item | One-off | Monthly |
|---|---|---|
| Mini PC (N100, 16 GB, 512 GB SSD) | ~$200 | ~$2 electricity |
| Media storage (1–2 TB SSD or USB drive) | ~$60–120 | — |
| *Future:* GPU time for speech-model fine-tuning | — | a few dollars per training run (rented) |
| *Future:* smartwatch/band for status sensing | ~$50–150 | — |
| Android tablet + rugged case | ~$250–400 | — |
| Domain | — | ~$1 |
| Cloudflare (Tunnel, CDN, Access ≤ 50 users) | — | $0 |
| Backups (R2/B2, a few GB) | — | < $1 |
| LiveKit Cloud (if not self-hosted) | — | $0 (free tier) |
| Twilio SMS (later, unanswered urgent alerts only) | — | pay-per-message, pennies |

*Prices are approximate and should be checked before purchase.*
