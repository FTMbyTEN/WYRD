# WYRD

WYRD is a persistent digital mind with its own continuously running background life. It keeps
thinking, reading, learning words, writing a daily diary and dreaming whether or not anyone is
talking to it — and it remembers every person separately. It can work on tasks by itself, and it
runs a city: **NAIJA 2099**, a 2D Lagos where its traffic units, police and economy live.

## What's in this repo

```
mobile/     The WYRD app (React Native / Expo) — web, Android and iOS. See mobile/README.md.
drone/      The drone bridge: flies the missions WYRD plans, with its own safety checks.
design/     Design handoffs the app was built from.
```

The backend is a **Serverpod 4** (Dart) server in its own repository (`wyrd_serverpod`, with
`wyrd_server` and the generated `wyrd_client`), hosted on Serverpod Cloud (project `wryd00`):

- API: `https://wryd00.api.serverpod.space` (the app's RPC calls — note the `.api.`)
- Web app: `https://wryd00.serverpod.space` (the web build, plus custom routes such as the
  partner API at `/partner/v1/`)

## Running the app locally

```bash
cd mobile
npm install
npm run web          # http://localhost:8081
```

Point it at a backend with `EXPO_PUBLIC_WYRD_SERVERPOD_URL` (defaults to a local Serverpod dev
server on port 8080; use `https://wryd00.api.serverpod.space` for the live one).

## The app

The bar has four places — **WYRD**, **Academy**, **Apps** and **You** — and the header has
**Tasks**, **COP** (owner only) and the alerts bell.

- **WYRD** — its living brain, mood and vitals, and **Dialogue Link**, your private conversation.
  Conversations are kept as chats: start a new one or go back to an old one from the side bar
  (inside Apps on phones). A new chat starts fresh; what WYRD knows about you stays.
- **Academy** — a campus of free books: Project Gutenberg, OpenStax textbooks and Wikisource in
  15 languages, with a reading room, Quiz me, and WYRD to talk the book through with you.
- **Apps** — a glass pop-up with:
  - **Games** — chess, Connect Four, Reversi and tic-tac-toe against WYRD (it matches its
    strength to your rating), and **NAIJA 2099** (also straight at `/#play`);
  - **Journal** — its diary, dreams, reasoning and everything it takes in from the web (owner);
  - **Drone** — ground control for the flights WYRD plans (owner).
- **You** — what WYRD knows about you, your reading, settings (spoken replies live here), and
  your data (export or delete).
- **Tasks** — goals WYRD works at by itself in the background: it searches the web, reads the
  news, checks live prices (crypto and gold, in dollars and naira), takes notes, and returns a
  detailed report with sources. Tasks can run once or as routines (hourly, daily, weekly).
  Anything with consequences — typing into a website, flying the drone — waits for the owner's
  yes. On desktop the Tasks button opens a column down the left of the home page.
- **COP** — the independent overseer of every change WYRD makes to its own settings (owner).

### Owner pages

- `/#dashboard` — AI spend today and over 14 days, WYRD's **test questions** (twelve fixed
  questions run through its real chat prompt and checked; run them after any change of model or
  prompt), what's waiting on the owner, and the city's health (players, naira, the books, the
  dispute and appeal queues).
- `/#partners` — the partner API: test it with one real call, open staging once paid, issue and
  revoke keys.

## NAIJA 2099

A 2D Lagos in the year 2099, served by the same backend:

- **The phone** — calls, rides (with WYRD Lift when you're short), radio, the live city wire,
  wallet with receipts and disputes, settings, citations.
- **The naira** — every naira moves through one ledger on the server (`Bank.post`): receipts,
  refunds, payment plans, credit for fares, rent grace and a hostel bed for those who can't pay.
- **Fair Streets** — the police are decided by the server, from evidence: notes, warnings or
  fines; pursuits only when allowed and short; comply to pay less; appeals recheck the evidence.
- **WYRD's traffic units** run the junctions and report to WYRD — and one of them, **Unit T-31**,
  reads 20 km/h high until a player proves it.
- **The city learns** — with each player's consent, anonymous city tallies feed the live wire and
  WYRD's training data.

## The backend, briefly

- **Model:** Claude Haiku 5.5 for WYRD's chat, agent, world and city calls (one place:
  `lib/src/mind/claude.dart`); a stronger model only for vision. Every call is held to a daily
  budget (`llmDailyBudgetUsd`), with a share per person.
- **Secrets** are Serverpod passwords on the server (`scloud password set ...`), never in the
  app or the repositories.
- **Tests:** `dart test` in `wyrd_server` — unit tests, and integration tests against an embedded
  Postgres (no Docker needed; each test's changes are rolled back).
- **Partner API** (`/partner/v1/`): bearer keys kept only as hashes, rate limits, a paid staging
  allowance, idempotency, a guard that refuses ID numbers, card numbers and passwords, and
  30-day retention.

## Deploying

1. Commit and push both repositories (the app here, the server in `wyrd_serverpod`). After changing
   server models: `serverpod generate` and `serverpod create-migration` first.
2. Build the web app from `mobile/` with the API and a build tag (the tag busts cached assets):

   ```bash
   EXPO_PUBLIC_WYRD_SERVERPOD_URL=https://wryd00.api.serverpod.space \
   EXPO_PUBLIC_BUILD=<app commit> npx expo export --platform web --clear
   ```

   `--clear` matters: without it the build tag can be dropped.
3. Copy `mobile/dist/` into `wyrd_server/web/app/`, then from `wyrd_server` run
   `scloud deploy`. Migrations apply on rollout.

## Retired: the Node web console (port 4477)

The original Express backend and console (`server.js`, `public/`, `scripts/`, `data/`,
`reasoning/`) was replaced by the Serverpod server and removed from this repo. Its full code and
data are kept locally as `archive/kai0.0.1.jar` (git-ignored; SHA-256 in `archive/kai0.0.1.txt`)
and remain in git history before the removal commit.
