# WYRD

A self-learning chat bot with its own persistent "mind" — background reasoning loops, real internet lookups, a live 3D brain visualization, and a private per-account conversation with every user who talks to it. No build step: plain Node.js/Express backend, vanilla HTML/JS/CSS frontend.

## What it actually does

- **Talks back via Claude** (Anthropic API), grounded in its own live state — mood, curiosity, vocabulary learned, memory blocks stored.
- **Never stops thinking in the background** — independent timers keep it self-questioning, comparing past memories, ingesting fresh Wikipedia/Hacker News articles, and learning new word definitions, whether or not anyone is chatting.
- **Remembers every user separately.** Real accounts (hashed passwords, persistent sessions) — each person gets their own private conversation thread and their own set of facts the bot has picked up about them. The mood/brain/reasoning are shared and public; the conversations are not.
- **Visualizes itself live** — a node-graph "brain" shaped like an actual brain, and a wireframe face, both reacting to its real state in real time.
- **Owner-only: real (read-only) browsing.** One specific account (you) can have it open pages in your own already-logged-in Chrome and read them, or search the web — never click, type, or submit anything. See [Owner browsing setup](#owner-only-real-browsing-optional) below.

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
2. **Chat** in DIALOGUE_LINK — it responds using its real memory, your account's own history, and anything it's picked up about you specifically over time.
3. **THE_MIND** panel shows its live mood, curiosity, confidence, vocabulary growth, and digest progress — this is shared across every user, not private.
4. **BRAIN_3D** (`/brain3d.html`, or the "EXPAND" link) is a full-page live view of its node-graph brain.
5. **NET_FEED** / **REASONING** show what it's currently pulling in from the web and what it's currently reasoning about — click **VIEW LOG** for the full reasoning history, or **THINK NOW** / **INGEST NOW** to force an immediate cycle instead of waiting for the timer.
6. **MIC** button enables voice input via your browser's built-in speech recognition (Chrome/Edge; the button disables itself automatically if unsupported).

Logging out (top-right) just ends your session — the bot's own background learning keeps running regardless.

## Owner-only real browsing (optional)

One specific account can ask it to actually open and read real web pages in your own logged-in Chrome — read-only, never clicking/typing/submitting anything.

1. In `.env`, set `OWNER_USERNAME` to the exact login username you use for that account (default is already set to whichever you registered as most recently — check `.env`).
2. **Fully close all Chrome windows**, then launch it with the debugging port open:
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```
   This reopens your normal profile — logins intact — just with that port available. Leave it open while chatting.
3. Ask it something like *"can you check what's on [url] right now?"* or *"search the web for X"* — only works from the owner's account; every other account never even sees this capability mentioned.

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
server.js              Express backend — accounts, chat, memory, reasoning loops, net ingestion
public/
  index.html            Main console UI (gate, THE_MIND, DIALOGUE_LINK, BRAIN_3D preview)
  brain3d.html           Standalone full-page 3D brain visualization
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

- `data/` (besides the two dataset files) holds real account passwords (hashed), sessions, and everyone's private chat history — treat it like any other secrets/user-data directory, never commit it.
- The owner-only browsing feature is tied to *your own local machine's* Chrome (`127.0.0.1:9222`) — moving the server to a VPS does not move that capability with it; it stays a local-only feature unless separately reconfigured to reach your home machine.
