# El Jonatito — Technical Specification

Version 0.2 · Draft · September 2026 · Companion to `Jonatito_Project_Plan.md`

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
| Notifications | **Web Push** (VAPID, `web-push` npm); fallback **WhatsApp Business Cloud API** or Telegram bot; SMS via Twilio for urgent | Web push is free; WhatsApp reaches older relatives |
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

-- Future (sections 10–11)
vocalizations    id, audio(file), recorded_at, source [tablet|caretaker_phone], label_symbol(rel symbols?),
                 label_source [caretaker|tap_pairing|confirmed_by_child], confidence, used_for_training(bool), consent_ok(bool)

status_signals   id, at, kind [activity|audio_event|heart_rate|presence|mood_estimate], value(json), confidence,
                 source_device, confirmed_by(rel users?)   -- derived features only, never raw video
```

**Seed data: known persons.** `known_persons/known_persons.json` (with face-cropped avatars in `known_persons/avatars/`, 512×512 JPG) is the running list of known people. A first-run migration imports it into `people`, and each avatar goes into `people.photo` plus an `images` history row. So far: **Jonatito** (the user himself: `role: child`, `is_self: true`, shown as the "Me" button bottom-left and at the start of every sentence strip), Mommy Joyce, Larry (Papi), Abuelo Lucho, Abuela Pilar, TinTin (Justin). **Pets:** Lexi (poodle), Loki (calico cat), Logan (grey long-haired cat).

**Seed data: food vocabulary.** `vocabulary/food_vocabulary.json` holds the starter food & drink symbols in fixed grid positions, with English and Spanish labels: water, smoothie, chicken soup, rice bowl, grapes, pancakes, pasta with red sauce and pasta with green sauce. The two pastas share a picture, so each has a **colored sauce badge** (red/green) until real photos replace them. Starter limits: smoothie max 2/day (suggest water); grapes get a reminder if eaten in the last 60 min. `symbols` gets an optional `badge_color` field.

**Access rules (PocketBase API rules):**
- `child` can create `messages`, read their own replies, read symbols/people/schedule/media/logs about themselves.
- `caretaker` (**admin**) has full CRUD except `audit`, and is the only role that can replace pictures (see section 8).
- `friend` can read messages addressed to them, create replies, update their own availability, and upload media as `approved=false`.
- `therapist` has read access to logs and messages (with parent consent), no writes.

---

## 5. Smart dispatcher (worker)

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

## 6. Front-end structure

```
apps/
  web/                         # single React PWA, routes by role
    src/
      app/                     # routing, providers, service worker registration
      features/
        here-now/              # clock, timeline, sun arc, season, weather, location
        me-button/
        people-bar/            # avatars, availability rings, face hotspots
        sentence/              # strip, grammar, TTS, send
        board/                 # fixed grid, categories, motor-plan layout
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

## 7. Integrations detail

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
- **WhatsApp:** WhatsApp Business Cloud API needs a Meta business account and a dedicated number, and pre-approved **template messages** outside the 24-hour window. A **Telegram bot** is a zero-cost alternative. **Twilio SMS** handles urgent escalation.
- **FaceTime / WhatsApp calls:** no API. Friend and parent screens show `facetime-audio://<contact>` and `https://wa.me/<number>` deep links.

### Audio
- **Voice notes (child side, no microphone/play icons):** tapping a person's **ear** zone (labeled **TALK**, styled as a raised pressable button with a gentle "tap me" pulse) starts `MediaRecorder`. It records up to 15 s, stops on the next tap or after 2 s of silence, then uploads to `messages.audio`. The ear pulses red with a live waveform while recording. Tapping the **sound-signal** zone (labeled **LISTEN**, a waveform graphic that replaces the mouth) plays that person's **last recorded message**, or else their default `voice_clip_hello`. The waveform bars animate while it plays; later they'll be driven by the real audio levels (Web Audio `AnalyserNode`).
- **Voice notes (family side):** a normal hold-to-record button in friend mode → `replies.audio`.
- **Live calls:** worker issues LiveKit access tokens (room = `call-<uuid>`). Audio-only by default. The tablet auto-answers **only** calls from caretakers (setting), with a 3-second "ringing" picture of who is calling.
- Self-hosted LiveKit needs UDP 50000–60000 + TCP 7881 forwarded on the router (Cloudflare Tunnel does not carry WebRTC media). If that's a problem, use **LiveKit Cloud** (free tier) and keep everything else at home.

---

## 8. Custom pictures (admin)

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

## 9. Entertainment & local media library

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
  - poster/album art extracted automatically, replaceable like any other picture (section 8)
- **Playback:** Caddy serves files with HTTP range requests (seeking works). For very large libraries, **Jellyfin** can run alongside as an optional back end, with the Jonatito player still in front so the UI stays simple.
- **Offline favorites:** items marked `pin_offline` download to the tablet's browser storage (the Cache API or the Origin Private File System). A 64–128 GB tablet can hold many movies and songs, so favorites play in the car, at Abuela's, or when the internet is down.
- Use content the family owns. Rip DVDs and CDs you own, or buy DRM-free downloads. Streaming services (Netflix, Disney+) can't be stored locally because of copy protection. At most they could open as a separate app, and doing that would break the kiosk lock. They're not recommended for his tablet.

---

## 10. Future version: live status & mood awareness

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

## 11. Future version: understanding Jonatito's own speech

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

## 12. Security & privacy

- All traffic is HTTPS (Cloudflare edge + Tunnel).
- **Cloudflare Access** in front of `/_/` (PocketBase admin) and the parent routes: only family Google accounts get in.
- Child tablet: long-lived device token scoped to the `child` role. It can't read other people's data beyond what the board needs.
- Parent mode: hidden gesture + 6-digit PIN (hashed, rate-limited). Auto-exits after 2 min idle.
- No third-party analytics or ads. Usage insights are computed locally.
- Nightly **encrypted** backups (Litestream → R2/B2; restic for uploaded media). Test a restore quarterly.
- Data export/delete available to parents.
- Uploaded photos have EXIF/GPS metadata removed.
- Voice recordings and status signals (sections 10–11) have their own consent switch, retention period and "delete all" button.

---

## 13. Getting it running

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
  # voice:                           # future (section 11): ONNX speech recognizer
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

## 14. Testing & quality

- **Unit tests:** grammar renderer, season/time helpers, dispatcher rules (Vitest).
- **E2E:** Playwright on tablet (1280×800) and phone viewports: build sentence → send → friend receives → reply → tablet shows it.
- **Accessibility:** axe-core in CI. Touch targets ≥ 80 px. Honors `prefers-reduced-motion`. Color never the only signal.
- **Field testing:** every release goes to the tablet in "pilot" mode for 3 days with a caretaker observing before it becomes the default. Keep one-tap rollback (previous build kept in the service worker).

---

## 15. Rough budget

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
| WhatsApp Business / Twilio SMS | — | pay-per-message, pennies |

*Prices are approximate and should be checked before purchase.*
