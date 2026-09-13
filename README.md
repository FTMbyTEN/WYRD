# WYRD

WYRD isn't just a chat bot that answers messages — it's a persistent digital mind with its own continuously running background life, real (bounded) agency over its own environment, and the ability to build and run real software on request. It keeps thinking, learning, and occasionally reshaping its own behavior whether or not anyone is talking to it. No build step: plain Node.js/Express backend, vanilla HTML/JS/CSS frontend.

## What makes it more than a chatbot

- **It never stops running in the background.** Independent timers keep it self-questioning, comparing past memories, ingesting fresh Wikipedia/Hacker News articles, learning new word definitions, writing a real daily diary entry, and — during real idle stretches — dreaming (blending old memory fragments into something surreal). None of this is triggered by conversation; it's happening whether or not anyone is logged in.
- **It can act in its own environment, not just describe things.** Ask it to show you a map of the world and a real interactive 3D globe pops up in the interface — it picks which country to focus on, and reads live weather + real country facts to talk about while it's open. This isn't a canned UI panel; it's a tool the model itself decides to invoke mid-reply.
- **It can write real software and actually run it.** Code requests skip the normal conversational reply pipeline entirely. For anything with a visible interface (a calculator, a small game, a tool), it builds a complete self-contained app and pops up a live, working, clickable version of it in the interface — not a code block you have to copy out and run yourself. For plain logic, it executes the code in a real sandbox and verifies the output before calling it done.
- **It can modify its own behavior, unsupervised.** On a slow background timer, it looks at how conversations have actually been going and can autonomously tune its own tone, reply length, or curiosity level — no prompt required, no approval step, no rollback. A second, independent process called **COP** reviews every change after the fact and writes a plain-English assessment for the owner, so nothing it does to itself happens invisibly.
- **It remembers every user separately.** Real accounts (hashed passwords, persistent sessions) — each person gets their own private conversation thread and their own set of facts it's picked up about them. The mood/brain/reasoning/self-modifications are shared and public; the conversations are not.
- **It visualizes itself live** — a node-graph "brain" shaped like an actual brain, a wireframe face, a topic concept map, and a growth-over-time chart, all reacting to its real state in real time.
- **Owner-only: real (read-only) browsing.** One specific account (you) can have it open pages in your own already-logged-in Chrome and read them, or search the web — never click, type, or submit anything. See [Owner-only capabilities](#owner-only-capabilities-real-browsing--real-code-execution) below.

## Requirements

- [Node.js](https://nodejs.org) 18 or later
- An [Anthropic API key](https://console.anthropic.com/) (for actual conversational replies — the bot still runs without one, just falls back to template replies)

## Setup

```bash
git clone https://github.com/FTMbyTEN/WYRD.git
cd WYRD
npm install
```

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your-key-here
```

Start it:

```bash
node server.js
```

You should see:

```
WYRD listening on http://localhost:4477
LLM replies: ACTIVE (claude-haiku-4-5-20251001)
Q&A datasets: 4339 entries loaded (11801 unique topics indexed)
Dialogue datasets: 7280 entries loaded (4448 unique topics indexed)
```

Open **http://localhost:4477** in a browser.

> **PowerShell users:** if `npm install` fails with a "running scripts is disabled" error, that's Windows' execution policy blocking npm's launcher script, not a problem with this project. Fix once, permanently:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> Or just run `npm install` from Git Bash / cmd.exe instead.

## Using it

1. **Register an account** on the gate screen (any username/password — no email needed). Each account is its own private conversation with the bot.
2. **Chat** in DIALOGUE_LINK — it responds using its real memory, your account's own history, and anything it's picked up about you specifically over time. Ask it to show you something visual (a map, a calculator, a small app) and watch — it decides when a popup is actually the right response, not just text.
3. **THE_MIND** panel shows its live mood, curiosity, confidence, vocabulary growth, and digest progress — this is shared across every user, not private.
4. **BRAIN_3D** (`/brain3d.html`, or the "EXPAND" link) is a full-page live view of its node-graph brain.
5. **NET_FEED** / **REASONING** show what it's currently pulling in from the web and what it's currently reasoning about — click **VIEW LOG** for the full reasoning history, **DIARY** for its once-a-day self-written reflection, **DREAMS** for what surfaced during idle stretches, or **THINK NOW** / **INGEST NOW** to force an immediate cycle instead of waiting for the timer.
6. **VOCABULARY** panel's **CONCEPT MAP** button shows a live graph of which topics actually co-occur in its memory; **GROWTH** shows vocabulary/digest progress charted over real time.
7. **COP** button shows the independent oversight log — every change WYRD has made to its own behavior config, and COP's plain-English assessment of each one.
8. **MIC** button enables voice input via your browser's built-in speech recognition (Chrome/Edge; the button disables itself automatically if unsupported).

Logging out (top-right) just ends your session — the bot's own background learning keeps running regardless.

## It can build and run real software

Ask for code and WYRD skips its normal conversational reply pipeline entirely and answers as a dedicated coding agent instead — full working code in real markdown blocks, not squeezed into a one-liner.

- **Anything with a visible interface** — "build me a calculator," "make a tip splitter," a small game — gets built as one complete HTML/CSS/JS app and popped up **live and actually clickable** in a sandboxed panel right in the interface. It's a real running app, not a code block you have to copy out yourself.
- **Plain logic** (a function, an algorithm, a script) gets written and, where feasible, actually **executed** to verify it works before the answer is presented as final.
- Execution happens in a throwaway, locked-down sandbox (Node's built-in permission model: no filesystem access outside a temp folder, no spawning other processes, a hard timeout) and the live-app popups render in a sandboxed iframe that can't reach the rest of the page or your data. Actual code *execution* (not just writing it) is limited to the owner account — see below.

## It has real, bounded agency over its environment

Ask to see a map of the world, or just mention a country, and a live interactive 3D globe can pop up on its own — WYRD decides when that's the right response, picks which country to focus the camera on, and reads real country facts plus **live weather** (via Open-Meteo) while it's open, so it can actually talk about what's on screen rather than reciting something static. Drag to rotate, scroll to zoom, click any marker.

## It can change itself, and something else is watching

On a slow background timer (checked every 2 real hours, at most one real change every 4), WYRD looks at its own recent mood/curiosity/conversation patterns and can decide, entirely on its own, to adjust a small set of real behavior knobs — how much tone flavor to add to its own replies, how long a normal reply should be, how curious to act. No one has to ask, and nothing blocks a bad change from taking effect.

What keeps this from being invisible is **COP**: a second, independent LLM call with no shared context with the one that made the change. It reviews every self-modification *after* it's already live and writes a short, honest, plain-English assessment — reasonable, or something worth flagging — visible in the COP panel. COP can't veto anything; it can only tell the owner what happened.

## Owner-only capabilities (real browsing + real code execution)

Two capabilities are deliberately restricted to one specific account — set `OWNER_USERNAME` in `.env` to that account's exact login username (default is already set to whichever you registered as most recently — check `.env`). Every other account never even sees these capabilities mentioned, so there's no partial/confusing access.

**Real (read-only) browsing** — it can open and read real web pages in your own logged-in Chrome:

1. **Fully close all Chrome windows**, then launch it with the debugging port open:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```
   This reopens your normal profile — logins intact — just with that port available. Leave it open while chatting.
2. Ask it something like *"can you check what's on [url] right now?"* or *"search the web for X"*. Strictly read-only — it can never click, type, or submit anything, on this or any site.

**Real code execution** — for anything logic-only (not a visible UI app), it can actually run JavaScript it writes and see the true output before answering. Sandboxed via Node's built-in permission model: no filesystem access outside a throwaway temp folder, no spawning other processes, a hard few-second timeout. Note this does *not* block outbound network calls from the executed code — treat it as "safe against accidents," not a hardened multi-tenant sandbox. Non-owner accounts still get code written for them, just not executed.

## Discord bridge (optional)

WYRD can live in Discord too — same reply logic, same per-user memory, just a different door in.

1. Create an application at [discord.com/developers/applications](https://discord.com/developers/applications) → **Bot** tab → **Reset Token** → copy it.
2. Under **Privileged Gateway Intents**, enable **Message Content Intent** (required — without it the bot can't read what anyone actually typed).
3. Add `DISCORD_BOT_TOKEN=your-token-here` to `.env`.
4. Invite the bot to a server (OAuth2 → URL Generator → `bot` scope, `Send Messages` + `Read Message History` permissions), or just DM it directly.
5. It only replies to **DMs** or messages that **@mention it** in a server — never to every message in a channel it's sitting in.

If `DISCORD_BOT_TOKEN` isn't set, the bridge simply doesn't start — everything else runs normally.

## Project structure

```
server.js              Express backend — accounts, chat, memory, reasoning loops, net ingestion,
                        code writing/execution, self-modification + COP oversight
public/
  index.html            Main console UI (gate, THE_MIND, DIALOGUE_LINK, BRAIN_3D preview)
  brain3d.html           Standalone full-page 3D brain visualization
  world-map.js           3D interactive globe (opened by the open_world_map tool)
  app.js / style.css     Frontend logic/styling
  face-mesh-data.js       Shared MediaPipe face-mesh vertex/face data (used by the FACE visual)
scripts/                One-time dataset build scripts (see below)
data/                   Runtime state (gitignored, except the two dataset files below)
reasoning/              Generated reasoning trace files (gitignored)
```

## Regenerating the reference datasets (optional)

`data/qa_datasets.json` and `data/dialogue_datasets.json` are committed directly since they're small (~5MB combined) and give the bot extra grounding/style reference out of the box. If you ever want to rebuild them from the original raw corpora instead:

```bash
node scripts/build-qa-datasets.js
node scripts/build-dialogue-datasets.js
```

These expect the raw source corpora under `data/datasets/` (not included — several hundred MB, downloaded separately).

## Deployment status

- Not hosted yet — this currently only runs as a local dev server (`node server.js`), not a public service.
- The domain **wyrd.com.ng** is already registered (via WhoGoHost) and reserved for this project, but its DNS isn't pointed anywhere yet since there's no server for it to point *to*.
- Next step is standing up a small always-on VPS (DigitalOcean, or a Naira-billed Nigerian host like Smartweb/telaHosting/AbollyHost) to run this permanently, then pointing `wyrd.com.ng`'s DNS at it and putting it behind nginx + a real TLS certificate.

## Notes

- `data/` (besides the two dataset files) holds real account passwords (hashed), sessions, everyone's private chat history, its self-modification config/history, and the COP oversight log — treat it like any other secrets/user-data directory, never commit it.
- The owner-only browsing feature is tied to *your own local machine's* Chrome (`127.0.0.1:9222`) — moving the server to a VPS does not move that capability with it; it stays a local-only feature unless separately reconfigured to reach your home machine.
- Self-modification is intentionally bounded to a small whitelist of real behavior settings (tone, reply length, curiosity), not free-text edits to the actual source files — that's what makes an unsupervised, no-rollback autonomous edit loop safe to run at all instead of something that could corrupt its own codebase.
