# WYRD Mobile

React Native (Expo) implementation of the `4a` screen from `WYRD Mobile.dc.html` (the Claude
Design handoff), wired to the real `consciousness-bot` backend (`server.js` at the repo root)
instead of the design prototype's mocked/simulated data.

## Running it

```bash
cd mobile
npm install
npx expo start
```

The backend has no env-configurable port — it's hardcoded to `4477` in `server.js`. Start it
separately from the repo root:

```bash
npm install
node server.js
```

By default the app points at:
- `http://localhost:4477` on iOS simulator / web
- `http://10.0.2.2:4477` on the Android emulator (the emulator's alias for the host machine)

For a physical device, or any other setup, override with:

```bash
EXPO_PUBLIC_WYRD_API_URL=http://<your-lan-ip>:4477 npx expo start
```

## What's real vs. adapted from the design

The design prototype (`WYRD Mobile.dc.html`) mocked every value in its own local component
state. This app wires every screen to the real backend endpoints instead — see
`src/api/client.ts` for the full endpoint list and `src/api/types.ts` for response shapes, both
transcribed directly from reading `server.js`. A few things didn't map 1:1 and were adapted
honestly rather than faked:

- **Alerts.** The backend has no alerts/notifications endpoint at all. The ALERTS overlay
  (`src/api/alerts.ts`) synthesizes a live feed from the real SSE events every other tab already
  reacts to (diary/dream/cop_report/self_modify/ingested) — real activity, re-framed as a
  notification list.
- **COP verdicts.** The design assumed a strict `REASONABLE`/`FLAGGED` field. The real
  `cop-log` entries carry free-text `verdict` prose with no enum. `CopTab.tsx` flags an entry
  when the verdict text contains "flag" (case-insensitive) — read the full verdict, don't trust
  the badge alone.
- **"Next window" cooldown (COP tab).** Not exposed by any endpoint — `SELF_MODIFY_MIN_GAP_MS`
  (4h) is a server-internal constant. Estimated client-side from the last config-change
  timestamp; genuinely approximate.
- **BRAIN_3D neuron count.** No dedicated endpoint (`brain3d.html` derives it client-side with
  no backend field). Shown as the real vocabulary count (`GET /api/lexicon/stats`) instead of a
  fabricated neuron counter — see the comment in `BrainOverlay.tsx`.
- **Owner-only capabilities list (YOU tab).** The three capabilities are real and independently
  gated server-side, but nothing exposes *whether the current account is the owner* to a client.
  Shown as informational text rather than a false ACTIVE/INACTIVE state.
- **World map country fields.** The design mocked a `population` field; the real
  `/api/world/country/:code` doesn't return one (capital/region/languages/currencies/weather
  only) — dropped rather than fabricated.
- **Mic / speech-to-text.** UI-only toggle, matching the design's own mocked behavior. There is
  no on-device STT wired up (would need `expo-speech-recognition` or similar) — a real follow-up,
  not implemented here.
- **Spoken replies (TTS).** This one *is* real, via `expo-speech` — toggling "SPOKEN REPLIES" in
  the YOU tab or the header speaks the bot's chat replies aloud.
- **Session cookie.** The backend's `sid` session cookie is `HttpOnly` with no `Secure` flag
  (plain HTTP dev server). `src/api/client.ts` relies on React Native's native cookie jar for
  same-process persistence and mirrors the value into `AsyncStorage` as a fallback for cold
  restarts — flagged there as worth verifying on a real device/simulator, which this environment
  couldn't do.

## Structure

```
src/
  api/          client.ts (all endpoints), sse.ts (live stream), hooks.ts (data hooks),
                AuthContext.tsx, alerts.ts, types.ts
  vortex/       shapes.ts (26 morph shapes) + engine.ts, ported from the design's gate-vortex
                engine; skiaLoop.ts / skiaSurfaceLoop.ts (imperative Skia drawing helpers)
  face/         faceMeshData.ts (copied from public/face-mesh-data.js) + faceProject.ts
  components/   VortexCanvas, FaceMark, BrainCanvas, GlobeCanvas, ConceptGraphCanvas,
                GrowthChartCanvas, RainBackground, ScreenEffects, ui.tsx (shared atoms)
  screens/      GateScreen (vortex login/register), AppShell (header + 5 tabs + bottom nav),
                tabs/, overlays/
```

## Verified so far

- `npx tsc --noEmit` passes clean.
- `npx expo export --platform android` and `--platform ios` both bundle successfully
  (1023–1025 modules, no resolution errors).
- **Not yet verified**: actually running on a simulator/device or against a live backend — this
  environment has no emulator/simulator available. Before shipping, run it against a real
  `node server.js` and sanity-check: the vortex gate's particle rendering/perf, the vignette/
  scanline look against the original HTML, and the cookie-session persistence note above.
