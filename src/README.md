# El Jonatito — app source

A picture-based communication and daily-structure app for Jonatito and his family.
See `../Jonatito_Project_Plan.md` and `../Jonatito_Tech_Spec.md` for the why and the what.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (server, web, tests) | One language, shared types (`shared/`) |
| Back end | **Node 22** + `node:http` with a small typed middleware/router layer (`server/http.ts`) | No framework or native modules to install on a home mini-PC or Raspberry Pi; small attack surface for a minor's data |
| Database | **SQLite** via Node's built-in `node:sqlite` (WAL mode) | A single file, easy to back up, no native build step (unlike `better-sqlite3`) |
| Realtime | **Server-sent events** (`/api/events`) | Live messages, replies, status rings; works through Cloudflare Tunnel |
| Auth | Name + PIN → HMAC-signed token (HttpOnly cookie + Bearer), `scrypt` PIN hashes, lockout after 5 wrong PINs | Simple for grandparents, safe enough for a family server |
| Front end | **React 19**, bundled with **esbuild** (`scripts/build-web.mjs`), installable web app | One app for the tablet (child mode) and phones (family mode) |
| Tests | **Playwright** end-to-end (`e2e/`) + `node:test` unit tests (`test/`) | Real browser, real server, fake microphone |

Middleware in `server/http.ts` / `server/auth.ts`: `authenticate` (cookie or Bearer), `requireAuth(...roles)`,
`jsonBody` (64 KB limit), `rawBody(types, limit)` for photos and voice (type + magic-byte checks),
`sendFile` with HTTP Range support, `safeJoin` against path traversal, and security headers + CSP on every response.

## Layout

```
shared/        types, 12-hour time helpers, sentence grammar (en/es), rules.ts (when an item is open),
               body.ts (body parts + pain sentences), geo.ts + cities.ts (where people are, their time)
server/        app.ts (wiring), http.ts (router + middleware), auth.ts, db.ts, schema.sql (v3),
               migrate.ts (v2 -> v3, with a backup), seed.ts, orbit.ts (fixed orbit layout),
               dispatcher.ts (who gets a message + gentle notes), repo.ts,
               routes/{auth,board,messages,day,voice}.ts, events.ts (SSE), uploads.ts
web/src/       child/ (tablet: orbit (home), person screen + globe, My body, full-screen player,
               All words board, dock, day, media, parent gate)
               family/ (phones + parent mode: inbox, For Jonatito, status + Where I am, quick log,
               items editor, voices, people, words, settings)
               common/ (Clock12, faces, body drawing, pain faces, tokens, sound, orbit geometry, hooks, recorder)
seed/          known_persons.json, food_vocabulary.json, vocabulary.json, orbit.json (slots + starter rules),
               media.json, users.json, avatars/, covers/, symbols/
e2e/           playwright.config.ts + tests/*.spec.ts
test/          unit tests (grammar, time, dispatcher)
```

## Run it

Requires **Node 22.13+** (for built-in `node:sqlite`).

```bash
cd src
npm install
npx playwright install chromium        # first time only, for the tests

# development
npm run dev:web &                        # rebuilds the web app on change
TOKEN_SECRET=change-me npm run dev       # http://localhost:8080

# production (behind Cloudflare Tunnel, see the tech spec)
TOKEN_SECRET=<long random string> PORT=8080 npm start
```

On Windows PowerShell set variables with `$env:TOKEN_SECRET="..."` before `npm start`.

Environment: `TOKEN_SECRET` (required), `PORT` (8080), `DATA_DIR` (`data/`), `LAT` / `LON` / `HEMISPHERE` / `PLACE_NAME`
(weather + season), `TZ` (the family's time zone, e.g. `America/New_York`).

The database is created and seeded from `seed/` on first start. `npm run seed:reset` wipes it and re-seeds.

**Upgrading from v0.2:** on the first start of v0.3 the database is upgraded in place to the item catalog
(`server/migrate.ts`). A full copy of the old database is written first, next to it:
`data/jonatito.sqlite.v2-backup-<time>`. To go back, stop the server and copy that file over `jonatito.sqlite`.

`scripts/gen-cities.mjs` regenerates `shared/cities.ts` (the "Where I am" city list) from the system time-zone table.

### Accounts (development PINs — change them!)

| Name | PIN | Role |
|---|---|---|
| jonatito | 1000 | child (the tablet) |
| joyce | 1234 | caretaker |
| lucho | 1111 | caretaker |
| larry | 2222 | caretaker |
| pilar | 3333 | friend |
| tintin | 4444 | friend |

`npm run set-pin -- joyce 5678` changes a PIN. Any caretaker PIN opens **parent mode** on the tablet
(hold the top-right corner for 3 seconds).

## Working in VS Code

Open **`El-Jonatito.code-workspace`** (one folder up), or just open the `src` folder. VS Code offers the recommended
extensions: Playwright Test, SQLite Viewer and Claude Code.

- **F5 → "Full stack: server + tablet"** builds the web app, starts the server with the debugger attached, and opens the
  tablet screen in Chrome. Breakpoints work in the `.ts`/`.tsx` files on both sides.
- **Testing panel (flask icon):** every Playwright E2E test shows up by file and name. Run or debug one at a time,
  watch it in a real browser ("Show browser"), or pick locators on the live page.
- **Terminal → Run Task:** `build:web`, `dev:web (watch)`, `typecheck` (errors land in the Problems panel),
  `test:unit`, `test:e2e`, `seed:reset`.
- **Database:** open `data/jonatito.sqlite` to browse people, messages, logs, etc. with SQLite Viewer.

## Tests

```bash
npm run test:unit      # grammar, 12-hour time, dispatcher rules (node:test)
npm run test:e2e       # 78 Playwright end-to-end tests (starts its own server in TEST_MODE)
npm test               # both
```

The E2E server runs with `TEST_MODE=1`, which enables `/api/test/reset` and `/api/test/clock`
(frozen server time for sleep lock, reminders and schedules). These routes do not exist otherwise.

What the E2E suite covers, by user:

- **Jonatito (tablet):** sign-in; the orbit as home (fixed inner and outer slots, reserved empty slots, Eat opening the
  foods, closed foods with a clock and "next snack", daily limits with a suggestion, reopening at snack time, busy /
  away marks, the globe pop-up); the person screen (where they are: same city / abroad / not shared, their time,
  "back in N sleeps"; voice shelf with pinned clips first, hearing marks notes heard; TALK, COME SEE, LOVE, busy card);
  My body (tap a part, pick a face: urgent / to the caretaker / logged); Pongo full screen and its night-time moon;
  Here & Now bar; the All words board (building, speaking, clearing and sending sentences; People page; core words;
  pasta badges); dispatch cards; replies (yes / wait with clock / no / voice); My day; media corner; parent gate.
- **Caretakers:** inbox + live replies (incl. pain reports with the body drawing); availability; quick log; the item
  editor (words, picture + revert, recorded sound + back to text-to-speech, time rules that close or only remind,
  moving an item with a confirmation, taken slots locked); pinning / hiding voice notes; hiding the potty zone;
  hiding words without moving anything; changing / reverting a person's photo; renaming and hiding people; parent mode.
- **Friends:** inbox + replies (incl. voice); "For Jonatito" voice notes (and seeing when he heard them); "Where I am"
  (city search, return date, stop sharing); availability; no admin access; only their own notes and location.
- **Security / API:** auth required everywhere, role checks, recipient-only replies, caretaker-only parent gate,
  PIN lockout, upload type and magic-byte checks, path traversal, input validation, server-side sleep lock,
  catalog slot rules (taken 409, reserved 400), city-level location rounding, pain report validation.

## Not built yet (next steps)

Google Calendar sync (availability + routine), Web Push / WhatsApp notifications for closed phones, live audio calls
(LiveKit), a full media library (v0.3 plays one uploaded file per media item), symbol-library search and cropping in the
item editor, WhatsApp voice notes into the voice shelf, caretaker voice commands, service worker for full offline use,
and the future-version features (status sensing, personal speech recognition). The data model and
`dispatcher.ts` are shaped so these plug in without changing the child's screens.
