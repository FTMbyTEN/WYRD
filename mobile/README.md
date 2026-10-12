# WYRD — the app

The WYRD app in React Native (Expo), for web, Android and iOS: WYRD's brain and Dialogue Link,
the Academy, games, NAIJA 2099, tasks, and the owner's tools. It talks only to the WYRD
**Serverpod** backend (repository `wyrd_serverpod`, hosted on Serverpod Cloud). What the app
does is described in the [main README](../README.md); this file is about the code.

## Running it

```bash
cd mobile
npm install
npm run web          # http://localhost:8081   (or: npx expo start)
```

### Pointing it at a backend

The app reads `EXPO_PUBLIC_WYRD_SERVERPOD_URL`. If it's unset, it uses a local Serverpod dev
server (`dart bin/main.dart` in `wyrd_server`, port `8080`):
- `http://localhost:8080` on the iOS simulator and the web
- `http://10.0.2.2:8080` on the Android emulator (its alias for the host machine)

For the live server:

```bash
EXPO_PUBLIC_WYRD_SERVERPOD_URL=https://wryd00.api.serverpod.space npm run web
```

**Use the `.api.` subdomain.** `https://wryd00.serverpod.space` serves the web build and custom
routes; RPC calls to it fail with a bare `405`, which looks just like a CORS error in a browser
console. The API is at `https://wryd00.api.serverpod.space`.

### Direct links

| Hash | Opens |
| --- | --- |
| `#play` / `#naija` | NAIJA 2099, full screen |
| `#dashboard` | the owner's dashboard (AI spend, test questions, queues) |
| `#partners` | the owner's partner-API page (keys, staging, a live test) |
| `#bake-cars` | development only: renders the 2D game's vehicle sheets |

## How it talks to Serverpod

There's no official JS/TS Serverpod client, so `src/api/serverpodClient.ts` implements its wire
protocol, worked out from the generated Dart client:

- `POST {baseUrl}/{endpoint}/{method}` with the arguments as a plain JSON object body;
- `Authorization: Bearer <accessToken>` on authenticated calls; the access/refresh token pair is
  kept in `AsyncStorage`, and a `401` is retried once after a refresh (`jwtRefresh`);
- `200` → the raw JSON return value; anything else → Serverpod's error JSON, turned into a
  readable message (e.g. `{data: {reason: "invalidCredentials"}}` → "invalid credentials").

`src/api/client.ts` wraps every endpoint and adapts Serverpod's shapes to the UI types in
`src/api/types.ts`. Many newer endpoints return JSON strings, parsed there.

| Area | Endpoint (methods) |
| --- | --- |
| Accounts | `emailIdp` (register, log in, reset password), `jwtRefresh`, `profile`, `account` (export, delete) |
| WYRD's mind | `mind`, `brain`, `memory`, `lexicon`, `growth`, `reasoning`, `diary`, `dream` |
| Dialogue Link | `chat` (`sendMessage`, `getHistory`, `rate`, `chats`, `newChat`, `openChat`), `photo`, `document` |
| Tasks | `agent` (`create`, `mine`, `steps`, `decide`, `runNow`, `cancel`, `markRead`) |
| Academy | `library` |
| Games | `games` (chess, Connect Four, Reversi, tic-tac-toe; ratings, challenges) |
| NAIJA 2099 | `city` (the world, wallet and receipts, rides, jobs, homes, story missions, police, city signals) |
| Feed and trust | `feed` |
| World map | `world` |
| COP | `selfConfig` (`getConfig`, `getCopLog`, `trigger`) |
| Alerts | `alerts` |
| Drone | `drone` (owner) |
| Owner | `dashboard` (`get`, `runEval`, `evalRun`), `partnerAdmin`, `owner` (`userStats`) |

Owner-only screens are hidden from everyone else, and the server checks again on every call.

### Accounts

Email-based, in steps: enter an email → the server emails a code (`startRegistration`) → enter
it (`verifyRegistrationCode`) → choose a password (`finishRegistration`). Password reset works
the same way.

### Live updates are polled, not pushed

Serverpod has no server-sent event stream here, so `src/api/stream.ts` makes the same events by
polling and comparing (the mind every few seconds; the feed, diary, dreams and COP less often).
A source polls only while something listens, and pauses while the app is in the background. A
sent message publishes its own `chat` and `mind` events at once. `src/api/shared.ts` is the one
request layer: the same data is never fetched twice at once, and every screen showing it hears
each new value.

## Structure

```
src/
  AppRoot.tsx   sign-in gate, the app, and the direct-link pages (#play, #dashboard, #partners)
  api/          serverpodClient.ts (wire protocol, tokens), serverpodAuth.ts, AuthContext.tsx,
                client.ts (every endpoint + adapters), types.ts, stream.ts (polled events),
                shared.ts (request cache), hooks.ts (data hooks, incl. useChats / useConversations)
  screens/      GateScreen, AppShell (header, tabs, panels), Header, TabBar (+ the chats list
                in the desktop side bar), AppsSheet (the glass Apps pop-up), Dashboard,
                PartnerKeys, tabs/ (WYRD, Academy, Games, Journal, Drone, You),
                overlays/ (Dialogue Link, Tasks, COP, Alerts, Brain 3D, globe, concept map, ...)
  components/   BrainCanvas, FaceMark, GlobeCanvas, RichText (Markdown: headings, lists,
                tables, links), glyph/ (WYRD's icon set), glass.ts (the glass pop-up look), ui.tsx
  world2d/      NAIJA 2099: Lagos2D (the game), Phone, traffic, router, render, person, story,
                and the asset bakers (Bake*.tsx)
  world/        the city's panels: design studio, missions, homes, places, radio, HUD
  vortex/, face/  the gate's vortex and WYRD's face mesh
  theme.ts      the Warm Lagos palette and type (VT323, Share Tech Mono)
```

## Building and checking

- `npx tsc --noEmit` — the type check; keep it clean.
- `npx expo export --platform web --clear` — the web build that ships. Set
  `EXPO_PUBLIC_WYRD_SERVERPOD_URL` and `EXPO_PUBLIC_BUILD` (the commit, which busts cached
  assets); `--clear` keeps the build tag from being dropped. Deploying is in the
  [main README](../README.md#deploying).
- Web is the main target: the glass pop-ups are frosted there, and plain translucent on native
  (a native blur would need an extra package).
