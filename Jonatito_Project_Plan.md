# El Jonatito — Project Plan

*A picture-based communication and daily-structure app for a non-verbal autistic child and his family.*

Version 0.2 · Draft · September 2026 · Owner: Lucho

---

## 1. Vision

Give Jonatito a **voice he can reach with one finger**, and a **window that always tells him where and when he is**.

The app does three things:

1. **Grounds him in the here and now.** Every screen shows the time, the day, the season, the weather, and where he is in his day. The virtual world always matches the real one.
2. **Lets him say what he wants, to whom he wants.** He builds short sentences from pictures (*who → what → action*) and the app delivers them to the right person, in the right way, at the right time.
3. **Connects the family around him.** Caretakers log meals and routines, share their availability, and answer him — by voice, push notification or WhatsApp.

**The goal:** more structure, more agency, fewer moments of being misunderstood.

---

## 2. Who uses it

| User | Description | Main device | Mode |
|---|---|---|---|
| **Jonatito** | Primary user. Non-verbal, not independent, touch-first. | Dedicated tablet (locked in kiosk mode) | **Child mode** (default) |
| **Parents / main caretakers** | Configure the app, log food and routines, manage vocabulary, schedule and availability. | Their phones, plus the tablet behind a lock | **Parent mode** |
| **Family & friends network** | Grandparents, uncles, aunts, cousins, therapists. They get messages and reply, share availability, and can start audio calls. | Their phones (installed web app) | **Friend mode** |
| **Therapists (optional)** | Speech therapist or occupational therapist. Read-only reports, suggest vocabulary. | Web | Friend mode with extra read access |

---

## 3. Design principles (non-negotiable)

These come from established AAC (augmentative and alternative communication) practice and autism-friendly design:

1. **Icons never move.** Every symbol keeps its place for good (this is called *motor planning*). New words go into empty slots; nothing gets reshuffled. Muscle memory is language.
2. **Predictable and calm.** No surprise pop-ups, no flashing, no auto-playing sound, no timeouts that erase his work. Muted palette, one clear focus per screen.
3. **Nothing punishes him.** No "wrong" sounds. Undo is always one tap away. Accidental taps cost nothing.
4. **Every tap gives feedback.** Visual highlight plus the word spoken aloud (volume adjustable, can be turned off).
5. **Big targets.** At least 2 cm (≈ 80 px on a 10" tablet), with spacing between them. The tablet is used in landscape.
6. **Real photos first.** Family members are real faces. Common items (his cup, his favorite grapes) use real photos where possible; standard symbols fill in the rest.
7. **Consistent colors for word types** (a modified Fitzgerald Key, the usual AAC convention):
   🟨 People · 🟩 Actions · 🟧 Things · 🟦 Describing words · 🩷 Social · 🟥 Urgent / Stop
8. **Always-on essentials.** *Yes*, *No*, *Stop*, *Help*, and *I hurt* are visible on every screen.
9. **The system does the hard part.** He says *what* he wants. The app works out *how* to deliver it: who's available, which channel to use, and whether a gentle reminder helps.
10. **Grows with him.** Start with a small vocabulary (about 20–40 symbols) and add more as he masters them. Parent mode can hide and reveal symbols without moving them.
11. **Time is always a real clock.** Every time on screen is a regular **12-hour analog clock face** (the same one as the main clock), with the waiting or remaining time **shaded** on the dial, next to short 12-hour digits ("3:15"). No hourglasses, sand-timers or generic time icons, and as little text as possible.

---

## 4. Features

### 4.1 The "Here & Now" bar (always visible)

A band across the top of every screen in child mode:

- **Analog + digital clock.** The analog face helps with time as a visual "shape".
- **Day timeline.** A horizontal strip from wake-up to bedtime with icons for his routine (breakfast, school, lunch, park, bath, sleep). A **"NOW" marker** slides along it in real time. Things that are done fade out; the next thing is highlighted ("First… then…").
- **Sun/moon arc.** A small sky showing the sun's position (real sunrise and sunset times). It turns to night with a moon.
- **Day of week** as a color and a picture, plus the date.
- **Season** as a picture (🌸 ☀️ 🍂 ❄️), worked out from the date and hemisphere.
- **Weather and temperature** from the real location: icon, °C/°F, and a "what to wear" hint (jacket, umbrella).
- **Where am I** (optional): 🏠 Home / 🏫 School / 👵 Grandma's house, set by the caretaker or detected from Wi-Fi/GPS.

### 4.2 The "Me" button (bottom left)

- Jonatito's own face sits in the corner where the Windows Start button usually is.
- **Tapping it opens his personal menu:** *I feel…* (feelings board), *I want…*, *My body* (pain map), *My day* (schedule), *My media*.
- Every message he sends starts from "Me", which teaches him that *what comes out of this machine comes from him*.
- When he gets a reply, his avatar glows gently.

### 4.3 People bar and avatars

- A row of family avatars (real photos in round frames), ordered by closeness and never re-sorted.
- **A ring around each avatar shows availability:** 🟢 available · 🟡 busy, can reply later · ⚫ away/asleep. It comes from the shared calendar plus each person's quick status.
- **Tapping an avatar enlarges the face, and the face has touch zones:**
  - 👂 **Ear = TALK.** Styled as a big pressable button that gently invites a tap. Tapping it records his sounds as a **voice message** to that person ("I talk into your ear"). It replaces a microphone icon, which he doesn't recognize.
  - 〰️ **Sound signal = LISTEN.** A picture of a sound wave sits where the mouth was. Tapping it **plays that person's last recorded message**, or their default hello ("¡Hola, mi Jonatito!") if there's none. The wave animates while it plays. It replaces a play/speaker icon.
  - 👀 **Eyes** → "Look at me / come see" (asks the person to come)
  - ✋ **Hand** → "Help me" / "Hug"
  - ❤️ **Heart** → "I love you / I miss you"
- This makes the most common social messages a single, physical gesture.

### 4.4 Sentence builder

- A **sentence strip** at the top holds the tokens as he picks them: `[Me] → [Grandpa] → [Grapes] → [Eat]`.
- **Order doesn't matter.** The app puts the tokens into correct grammar ("Grandpa, I want to eat grapes") and speaks it with text-to-speech (a child-like voice, or clips recorded by the family).
- **Categories are fixed tabs:** People · Food · Drinks · Actions · Places · Feelings · Play · Body · Clothes.
- **Send** = a big green arrow. **Clear** = swipe the strip or tap ✖. **Speak only** = tap the strip (say it out loud in the room without sending).
- **Quick phrases:** his 6–8 most used sentences stay pinned (set by parents, informed by usage data).

### 4.5 Smart dispatcher (the "brain")

When he taps **Send**, the app decides how to deliver the message:

1. **Who?** The person he chose. If none, the default caretaker (whoever is "on duty" in the calendar).
2. **Are they available?** Check calendar free/busy plus manual status.
   - Available → push notification with the spoken sentence + picture strip, plus a sound on their phone.
   - Busy → show Jonatito a friendly card: *"Grandpa is at the doctor 🏥 until 3:00 — back in 🕐 45 min. Send to Mom instead?"* with photos of who's available. The original message still gets queued for Grandpa.
3. **Context rules** (set in parent mode):
   - *Recent consumption:* "You had grapes 🍇 **32 min ago**" (from the log). This is shown gently; he can still send the message.
   - *Limits:* "Juice: 2 of 2 today" → suggests water instead.
   - *Schedule:* "Lunch is next! 🍽️ in 15 min."
   - *Quiet hours:* after bedtime, messages go to the on-duty caretaker only.
4. **Urgent** (*Help*, *I hurt*, *Stop*): skips all rules and goes to **everyone who is on duty right now**, with a loud alert and escalation (WhatsApp/SMS if nobody answers within N minutes).
5. **Replies come back as pictures + voice:** ✅ "Yes!", ✋ "Wait", ❌ "Not now", or a recorded voice note. "Coming" or "Wait" shows a **12-hour clock face with the wait shaded** and the arrival time ("4:45").

### 4.6 Two-way audio

- **Voice messages** in both directions, with no microphone or play icons on his side. He **taps the person's ear (TALK)** to send his sounds to them, and **taps the sound-wave (LISTEN)** to hear them.
- **Live audio calls** (WebRTC) are started by a family member for now. The tablet shows who is calling and answers automatically for caretakers. Video can come later.
- Family members can record **voice clips of their own words** ("¡Hola Jonatito!"). Those play when he taps the sound-wave (LISTEN), so he hears Grandpa saying hello in Grandpa's own voice.
- **FaceTime/WhatsApp:** these can't be embedded directly. Parent and friend mode offer one-tap buttons that open FaceTime or WhatsApp on the caretaker's phone. Jonatito's side uses the app's own audio.

### 4.7 Voice activation

He is non-verbal, so voice is mainly **for the adults and for output**:

- **Voice output:** every symbol and sentence is spoken.
- **Caretaker voice commands** (parent mode): "Log: he ate half a banana", "Set Grandma to busy until 4".
- **Experimental:** learn Jonatito's own sounds and vocalizations (for example a sound he always makes for "more"). This means recording samples and training a small keyword model. It's a Phase 4 item that needs careful guidance from his speech therapist.

### 4.8 Daily log (visual)

- **Caretakers enter** food, drinks, medication, sleep, toilet, mood, and activities. Entry is quick: photo buttons plus an amount (¼, ½, ¾, all).
- **Jonatito sees his day as pictures:**
  - A **plate** that fills up as he eats (breakfast/lunch/snack/dinner segments).
  - A **glass/water bottle** that fills up.
  - A strip of **what he's already done today** under the timeline.
- **Parents see** trends over weeks (eating patterns, sleep, mood vs. events), exportable for doctors and therapists.
- The log feeds the smart dispatcher ("grapes 32 min ago").

### 4.9 Visual schedule & shared calendar

- **A shared Google Calendar** ("Jonatito — Family") where each person books their availability and duty shifts.
- **A second calendar ("Jonatito — Day")** holds his routine and special events (doctor, birthday, trip). Each event has a picture.
- The app reads both: availability rings, the "on duty" caretaker, and the day timeline.
- **"Coming up" countdowns** for big events ("🎂 Cousin's birthday in 3 sleeps").

### 4.10 Entertainment corner

Entertainment is his reward, his comfort, and a big reason to pick up the tablet at all. See Tech Spec section 9 for details.

- **His favorite movies and songs are stored locally** on the family's home server. Favorites are also copied onto the tablet, so they play offline, in the car, or at Abuela's.
- **My movies & shows** as big poster tiles, with **"keep watching"** that remembers where he stopped.
- **Favorite moments:** parents bookmark the scenes he loves as short loops he can replay.
- **Jukebox:** songs as big album-art buttons, plus **playlists tied to routines** (bath 🛁, car 🚗, calm 🧘, bedtime 🌙).
- **Family channel:** photos and short videos from relatives, after a parent approves them.
- **Sensory play:** bubbles, piano and drum pad, fireworks, fish tank. No ads, no purchases.
- **Social stories** (dentist, haircut, trip) in the same player.
- **He can ask for media in a sentence** (`[Me] [watch] [Trains]`). The app plays it if media time is open, or answers visually ("after dinner 🍲").
- **Curated only:** no open YouTube, no autoplay of the next video.
- **Media clock:** the same 12-hour clock face every time, with the remaining media time shaded and the end time underneath ("4:50"). A gentle warning at 2 minutes, and a fade-out at the end instead of a hard cut.
- **Sleep lock:** during sleep hours, movies and games are locked (a sleeping moon 🌙 shows when they "wake up"). Before bed there's a wind-down window with only calm music, then only the bedtime playlist with a sleep timer. The lock is enforced on the server, and a caretaker can grant "+15 min".

### 4.11 Parent mode

- **Entry:** a hidden gesture (for example a 3-second hold on the top-right corner) + PIN. Jonatito can't enter it by accident.
- **Features:**
  - **Change any picture:** every avatar, place, thing and media cover can be replaced with a **real photo** (camera or gallery, crop, optional background removal). The symbol keeps its position, color and sound, and the old picture can be restored in one tap. Relatives can *suggest* photos, and an admin approves them.
  - Vocabulary manager: add, hide, or reveal symbols, record audio labels.
  - People manager: avatars, roles, contact channels, voice clips.
  - Log entry and history.
  - Rules for the dispatcher (limits, quiet hours, reminders).
  - Schedule editor (or sync from Google Calendar).
  - Usage insights: most-used words, time of day, attempts vs. successful messages.
  - Settings: voice, volume, language, text under symbols on/off, grid size.

### 4.12 Friend mode

- An installable web app on each family member's phone.
- **Inbox** of Jonatito's messages (picture strip + audio), with one-tap picture replies.
- **Status toggle** (available/busy/away) and a link to the shared calendar.
- **Voice note and call buttons.**
- A **"Send Jonatito a photo"** button: family photos go to his media corner after a parent approves them.
- A **"Today at a glance"** view (optional, per person): what he's eaten, his mood, his schedule.

### 4.13 Additions to fill the gaps

- **Feelings board and "zones":** happy / sad / angry / scared / tired / too loud. An "I need a break" button starts a calm-down screen (breathing bubble, favorite song, dim colors).
- **Body map for pain:** tap where it hurts on a body outline. This is urgent-class.
- **"Too much" button:** instantly lowers volume and brightness and pauses notifications.
- **First/Then board:** caretakers set "First shoes 👟, then park 🌳".
- **Choice boards:** caretakers push "Which one? 🍎 or 🍌" to his screen, and he answers with one tap.
- **Offline mode:** the core board, text-to-speech, and schedule work without internet. Messages queue and send when the connection is back.
- **Bilingual support:** labels and voice in Spanish and/or English (to be confirmed).
- **Kiosk lock:** the tablet stays inside the app (iPad Guided Access / Android screen pinning or a kiosk browser).
- **Privacy:** all data about a minor stays on family-controlled hardware. No ads, no trackers.

### 4.14 Future versions

- **Live status & mood awareness:** optional, local-only inputs (tablet camera/mic, room camera, smartwatch, and his app usage) estimate whether he's asleep, calm, active, unsettled or distressed.
  - The status is a **suggestion for adults**: alert the on-duty caretaker, quiet the tablet, or offer him a break or music.
  - It never labels him, and raw video/audio is never stored.
  - Caretakers confirm or correct the status, and the corrections improve accuracy. See Tech Spec section 10.
- **Understanding his own speech:** the app learns Jonatito's unique sounds and word approximations. It shows what he said as pictures and speaks it in **English and Spanish** (more languages later).
  - Family members label his sounds from day one using a "What did he say?" button.
  - A personal recognizer comes next, then a fine-tuned speech model.
  - It always asks him to confirm (top 3 guesses as pictures) before speaking for him. See Tech Spec section 11.

---

## 5. Scope by phase

| Phase | Duration (est.) | Deliverables | Done when… |
|---|---|---|---|
| **0 — Discovery** | 2–3 weeks | Meet his speech therapist/OT. Observe his current communication (gestures, sounds, pointing). List his top 30 wants/needs. Photograph family, food, and objects. Pick the tablet. Confirm language(s). | A signed-off starter vocabulary and people list |
| **1 — MVP: Talk** | 4–6 weeks | Here & Now bar · Me button · People bar · Sentence builder with text-to-speech · Send to one caretaker via push notification · Picture replies · Parent mode (basic vocabulary + people) · Kiosk setup | Jonatito sends a real request that a family member receives and answers |
| **2 — Structure** | 4 weeks | Visual daily log (plate/glass) · Day timeline from Google Calendar · Availability rings · Smart dispatcher v1 (availability + recent-consumption + limits) · Friend mode web app · Urgent escalation | A full day runs with the schedule and log in use |
| **3 — Connect & Play** | 5 weeks | Voice notes both ways · Live audio calls · Family voice clips · Local media library (movies, jukebox, favorite moments, offline favorites) · Media timers + sleep lock · Sensory play · Feelings/break screen · Body map | Grandparents use it on their own for a week, and bedtime runs with the sleep lock |
| **4 — Smart** | ongoing | Caretaker voice commands · Usage insights · Suggested words · Choice boards pushed from phones · Therapist reports · Start collecting labeled vocalizations | Driven by what the family and therapists ask for |
| **5 — Future: Sense & Understand** | after 1+ year of use | Live status/mood awareness (least-intrusive inputs first) · Personal speech recognizer → English/Spanish output · Personalized speech model | Recognizes his most common sounds reliably enough that the family approves voice-to-message |

**Guideline:** release to Jonatito in small steps. Introduce 1–2 new features at a time, with an adult modeling each one (*aided language modeling*: adults tap the symbols themselves while they talk to him).

---

## 6. Success measures

- He starts communication himself (not prompted) **X times/day**, counted from the logs. Set the baseline in Phase 0.
- Messages that get a reply within 5 min: **> 80%**.
- Fewer meltdowns linked to "not being understood" (caretaker mood log, compared with the baseline).
- Vocabulary actively used: grows month over month.
- Family members active weekly: **≥ 5**.
- Caretakers say logging takes **< 15 seconds** per entry.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| He rejects or throws the tablet | Rugged case and strap. Introduce it during calm, happy moments. Pair it with a highly motivating reward (favorite food/video) so the first successes come fast. |
| Too many symbols overwhelm him | Start small, hide symbols (never move them), and expand gradually on the therapist's advice. |
| The "smart" rules feel like refusal | Reminders are informational and never block. Every message still gets delivered. The tone is always kind and visual. |
| Family doesn't respond → he learns it doesn't work | On-duty rota, escalation, and a fallback to whoever is physically present. Make answering take one tap. |
| Home internet/server goes down | Offline-first web app, a queue for messages, a cheap cloud fallback for relay, and nightly backups. |
| Privacy of a minor's data (especially his voice and any camera sensing) | Self-hosted, encrypted backups, role-based access, no third-party analytics. Separate consent and a "privacy off" switch for the future sensing and voice features. |
| Apple devices limit web push/audio | The family installs the web app ("Add to Home Screen"). WhatsApp is the fallback channel. The tablet is ideally Android, or an iPad with Guided Access. |
| Project stalls (volunteer effort) | Phase 1 is deliberately small. Use proven building blocks (PocketBase, LiveKit, Open-Meteo) instead of custom infrastructure. |

---

## 8. Open questions for the family

1. **Language(s):** Spanish, English, or both? Which voice (child, adult, family-recorded)?
2. **Current communication:** Does he already use PECS, sign, pointing, or another AAC app? We should build on it, not replace it.
3. **Motor skills:** Can he tap accurately, or does he need bigger targets or a "tap on release" setting?
4. **Reading:** Should text labels show under symbols (helpful for literacy exposure)?
5. **Device:** Is there an existing tablet? iPad or Android?
6. **Who's in the network?** Names, photos, relationships, and preferred channels (app, WhatsApp, SMS).
7. **Location:** City (for weather/season) and hemisphere. Does he spend time in more than one home?
8. **Sensory profile:** Sounds, colors, or animations to avoid?
9. **Therapy team:** Is there a speech therapist we can involve in vocabulary and rollout?
10. **Media:** Which movies, shows and songs are his favorites? In what formats does the family own them (DVDs, files, CDs)? What are his bedtime and wake-up times?
11. **Hosting:** Is there a computer at home that can stay on 24/7? Who maintains it?

---

## 9. Related documents

- `Jonatito_Tech_Spec.md` — architecture, stack, data model, setup instructions.
- `Jonatito_Mockups.html` — clickable interface mockups (open in any browser).
