# WYRD Mobile

React Native (Expo) implementation of the `4a` screen from `WYRD Mobile.dc.html` (the Claude
Design handoff), wired to the real WYRD **Serverpod** backend instead of the design prototype's
mocked/simulated data.

> **Backend migration.** This app originally talked to the Node/Express server (`server.js` at
> the repo root). It has since been moved onto a Serverpod (Dart) backend:
> - **Phase 1** — auth moved to Serverpod's email + JWT flow (`AuthContext.tsx`, `serverpodAuth.ts`).
> - **Phase 2** — every data method in `src/api/client.ts` now calls Serverpod RPC endpoints.
>
> The Serverpod server source (`wyrd_server` / its generated Dart client `wyrd_client`) lives
> outside this repo. `server.js` still powers the web console at the repo root, but the mobile
> app no longer depends on it at all — see [Known gaps](#known-gaps-after-the-migration) for
> what hasn't been ported.

## Running it

```bash
cd mobile
npm install
npx expo start
```

### Pointing it at a backend

The app reads a single env var, `EXPO_PUBLIC_WYRD_SERVERPOD_URL`. If unset, it defaults to a
local Serverpod dev server (`dart bin/main.dart` in `wyrd_server`, port `8080`):
- `http://localhost:8080` on iOS simulator / web
- `http://10.0.2.2:8080` on the Android emulator (the emulator's alias for the host machine)

For the hosted Serverpod Cloud deployment, a physical device, or any other setup:

```bash
EXPO_PUBLIC_WYRD_SERVERPOD_URL=https://wryd00.api.serverpod.space npx expo start
```

**Use the `.api.` subdomain.** `https://<project>.serverpod.space` only serves the static
Flutter web build and returns a bare `405` on every POST — which looks identical to a CORS
failure in a browser console. The real API is at `https://<project>.api.serverpod.space`
(discoverable from `GET https://<project>.serverpod.space/assets/assets/config.json`).

## How it talks to Serverpod

There's no official JS/TS Serverpod client, so `src/api/serverpodClient.ts` is a from-scratch
implementation of its wire protocol, reverse-engineered from the generated Dart client:

- `POST {baseUrl}/{endpoint}/{method}` with the arguments as a plain JSON object body
- `Authorization: Bearer <accessToken>` on authenticated calls; the access/refresh token pair is
  persisted in `AsyncStorage`
- `200` → raw JSON return value; anything else → Serverpod's error JSON, decoded into a readable
  message (e.g. `{data: {reason: "invalidCredentials"}}` → "invalid credentials")

`src/api/client.ts` wraps each endpoint and adapts Serverpod's shapes to the UI types in
`src/api/types.ts` where they differ (e.g. `UserFact` objects → plain fact strings,
JSON-encoded `oldValueJson`/`newValueJson` → parsed values, flat COP-log fields → the nested
`change` object the COP tab expects).

| Area | Serverpod endpoint.method(s) |
| --- | --- |
| Auth | `emailIdp.login`, `startRegistration`, `verifyRegistrationCode`, `finishRegistration` |
| Mind | `mind.getMind` |
| Chat | `chat.sendMessage`, `chat.getHistory` |
| Profile / account | `profile.getProfile`, `account.exportData`, `account.deleteMyData` |
| Diary / dreams | `diary.getEntries`, `diary.trigger`, `dream.getEntries`, `dream.trigger` |
| Reasoning | `reasoning.trigger`, `reasoning.getNotes` |
| Self-config / COP | `selfConfig.getConfig`, `selfConfig.getCopLog`, `selfConfig.trigger` |
| Lexicon | `lexicon.getStats`, `lexicon.getWord` |
| Net feed | `feed.getRecent`, `feed.trigger` |
| Growth | `growth.getSnapshots` |
| Concept map | `memory.getConcepts` |
| World map | `world.getCountries`, `world.getCountry` |
| Alerts | `alerts.getAlerts` |

### Accounts

Accounts are now **email-based** and registration is multi-step, unlike the old username +
password register on `server.js`:

1. Enter an email → the server emails a verification code (`startRegistration`).
2. Enter the code (`verifyRegistrationCode`).
3. Choose a password (`finishRegistration`) → signed in.

Accounts made on the old Node backend don't carry over. On launch, a stored token pair is
trusted without a round-trip; an expired session surfaces as an error on the first real call.

## Known gaps after the migration

These are honest stubs, not faked data — worth knowing before assuming a screen is broken:

- **Live events are polled, not pushed.** Serverpod has no equivalent of `server.js`'s SSE
  stream, so `src/api/stream.ts` synthesizes the same events by polling and diffing:
  `mind` every 5s, `ingested` every 15s, and `diary`/`dream`/`cop_report`/`self_modify`/`profile`
  every 30s. A source only polls while something subscribes to it, and pauses while the app is
  backgrounded. `chat` (plus the reply's `mind`) is published locally when a message is sent.
  `thinking`/`idle`/`thought`/`ingesting`/`ingest_error` have no Serverpod source and never fire,
  so the brain visual pulses on feed ingests and COP reports only.
- **Tick countdowns.** `reasoningNext`/`feedNext` are client-side estimates (30s / 60s), not
  server values.
- **Growth "trigger".** There's no server-side snapshot trigger; it re-reads the latest snapshot.

## What's real vs. adapted from the design

The design prototype mocked every value in its own local component state. A few things didn't
map 1:1 onto the real backend and were adapted rather than faked:

- **COP verdicts.** The design assumed a strict `REASONABLE`/`FLAGGED` field. Real COP-log
  entries carry free-text `verdict` prose with no enum. `CopTab.tsx` flags an entry when the
  verdict text contains "flag" (case-insensitive) — read the full verdict, don't trust the badge
  alone.
- **"Next window" cooldown (COP tab).** Not exposed by any endpoint — the 4h minimum gap between
  self-modifications is server-internal. Estimated client-side from the last config-change
  timestamp; genuinely approximate.
- **BRAIN_3D neuron count.** No dedicated endpoint. Shown as the real vocabulary count
  (`lexicon.getStats`) instead of a fabricated neuron counter — see `BrainOverlay.tsx`.
- **Owner-only capabilities list (YOU tab).** Nothing exposes *whether the current account is
  the owner* to a client. Shown as informational text rather than a false ACTIVE/INACTIVE state.
- **Mic / speech-to-text.** UI-only toggle, matching the design's own mocked behavior. No
  on-device STT is wired up (would need `expo-speech-recognition` or similar).
- **Spoken replies (TTS).** Real, via `expo-speech` — toggling "SPOKEN REPLIES" in the YOU tab or
  the header speaks the bot's chat replies aloud.

## Structure

```
src/
  api/          serverpodClient.ts (RPC wire protocol + token storage), serverpodAuth.ts
                (email auth calls), AuthContext.tsx (auth state machine), client.ts (all data
                endpoints + shape adapters), stream.ts (polled live-event bus), hooks.ts (data hooks),
                alerts.ts, types.ts
  vortex/       shapes.ts (26 morph shapes) + engine.ts, ported from the design's gate-vortex
                engine; skiaLoop.ts / skiaSurfaceLoop.ts (imperative Skia drawing helpers)
  face/         faceMeshData.ts (copied from public/face-mesh-data.js) + faceProject.ts
  components/   VortexCanvas, FaceMark, BrainCanvas, GlobeCanvas, ConceptGraphCanvas,
                GrowthChartCanvas, RainBackground, ScreenEffects, ui.tsx (shared atoms)
  screens/      GateScreen (vortex + email login/register), AppShell (header + 5 tabs + bottom
                nav), tabs/, overlays/
```

## Verified so far

- `npx tsc --noEmit` passes clean.
- `npx expo export --platform android` and `--platform ios` both bundle successfully.
- Against the live Serverpod Cloud deployment, a bogus login returns the server's real
  structured error ("invalid credentials") — the request/auth/error-handling pipeline works end
  to end.
- **Not yet verified**: a full signed-in session on a simulator/device against Serverpod
  (registration email delivery, token refresh on expiry, every tab's data rendering).
