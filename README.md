# WYRD

WYRD is a persistent digital mind with its own continuously running background life. It keeps
thinking, reading, learning words, writing a daily diary and dreaming whether or not anyone is
talking to it — and it remembers every person separately.

## What's in this repo

```
mobile/     The WYRD app (React Native / Expo) — web, Android and iOS. See mobile/README.md.
drone/      The drone bridge: flies the missions WYRD plans, with its own safety checks.
```

The backend is a **Serverpod** (Dart) server in its own repository (`wyrd_serverpod`, with
`wyrd_server` and the generated `wyrd_client`), hosted on Serverpod Cloud:

- API: `https://wryd00.api.serverpod.space`
- Web app: `https://wryd00.serverpod.space`

## Running the app locally

```bash
cd mobile
npm install
npm run web          # http://localhost:8081
```

Point it at a backend with `EXPO_PUBLIC_WYRD_SERVERPOD_URL` (defaults to a local Serverpod dev
server on port 8080).

## The app

- **WYRD** — its living brain, mood and vitals, and Dialogue Link (your private conversation).
- **Journal** — its diary, dreams, reasoning and everything it takes in from the web.
- **Academy** — a campus of free books: Project Gutenberg, OpenStax textbooks and Wikisource in
  15 languages, with a reading room, Quiz me, and WYRD to talk the book through with you.
- **Drone** — ground control for the flights WYRD plans (operator account only).
- **You** — what WYRD knows about you, your reading, and your data (export or delete).

## Retired: the Node web console (port 4477)

The original Express backend and console (`server.js`, `public/`, `scripts/`, `data/`,
`reasoning/`) was replaced by the Serverpod server and removed from this repo. Its full code and
data are kept locally as `archive/kai0.0.1.jar` (git-ignored; SHA-256 in `archive/kai0.0.1.txt`)
and remain in git history before the removal commit.
