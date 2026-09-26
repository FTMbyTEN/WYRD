// WYRD drone bridge: connects to an ArduPilot autopilot over MAVLink (the SITL simulator, or a
// real flight controller when this runs on the drone's companion computer) and exposes a small
// local control API. Every command goes through the safety layer (safety.js).
//
//   npm start                       # listens for the autopilot on UDP 14550
//   MAVLINK_PORT=14551 npm start    # other port
//   WYRD_BRIDGE_TOKEN=... npm start # also connect to the WYRD server (same value as the server's
//                                   # droneBridgeToken secret); WYRD_SERVER_URL overrides the server
//
// Local API (127.0.0.1 only -- never exposed to the network):
//   GET  /state                 live telemetry + mission status
//   POST /command  {type,...}   one command: takeoff{altitudeM} goto{lat,lon,altitudeM} hold rtl land
//   POST /mission  {steps:[..]} run a list of commands in order
//   POST /abort                 cancel the mission and return home
const http = require('http');
const { MavlinkLink } = require('./link');
const { Pilot } = require('./pilot');
const { checkCommand } = require('./safety');
const { WyrdSync } = require('./wyrd-sync');

const MAVLINK_PORT = Number(process.env.MAVLINK_PORT || 14550);
const API_PORT = Number(process.env.BRIDGE_PORT || 8765);
const WYRD_SERVER_URL = process.env.WYRD_SERVER_URL || 'https://wryd00.api.serverpod.space';
const WYRD_BRIDGE_TOKEN = process.env.WYRD_BRIDGE_TOKEN || '';

const link = new MavlinkLink({ port: MAVLINK_PORT });
const pilot = new Pilot(link);

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
pilot.on('log', log);
pilot.on('failsafe', (reason) => log(`FAILSAFE: ${reason} -> returning home`));
pilot.on('override', (mode) => log(`OVERRIDE: pilot switched to ${mode}`));
pilot.on('mission', (m) => log(`mission ${m.status} (step ${m.index + 1}/${m.steps})${m.error ? `: ${m.error}` : ''}`));
link.on('connected', () => log(`autopilot connected (system ${link.target.system})`));
link.on('mode', (mode, prev) => log(`mode ${prev ?? '-'} -> ${mode}`));

function snapshot() {
  const s = link.state;
  return { ...s, telemetryAgeMs: s.lastTelemetryAt ? Date.now() - s.lastTelemetryAt : null, mission: pilot.mission, limits: pilot.limits };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const reply = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === 'GET' && req.url === '/state') return reply(200, snapshot());
    if (req.method === 'POST' && req.url === '/command') {
      const cmd = await readJson(req);
      const verdict = checkCommand(cmd, link.state, pilot.limits);
      if (!verdict.ok) return reply(422, { accepted: false, reason: verdict.reason });
      // takeoff/goto wait until reached; reply as soon as the command is accepted instead
      pilot.execute(cmd).catch((e) => log(`command ${cmd.type} failed: ${e.message}`));
      return reply(202, { accepted: true });
    }
    if (req.method === 'POST' && req.url === '/mission') {
      const { steps } = await readJson(req);
      if (pilot.mission?.status === 'running') return reply(409, { accepted: false, reason: 'a mission is already running' });
      try {
        if (!Array.isArray(steps) || steps.length === 0) throw new Error('mission has no steps');
        pilot._precheckPlan(steps);
      } catch (e) {
        return reply(422, { accepted: false, reason: e.message });
      }
      pilot.runMission(steps).catch((e) => log(`mission failed: ${e.message}`));
      return reply(202, { accepted: true });
    }
    if (req.method === 'POST' && req.url === '/abort') {
      await pilot.abort('abort requested');
      return reply(200, { ok: true });
    }
    return reply(404, { error: 'not found' });
  } catch (e) {
    return reply(400, { error: e.message });
  }
});

(async () => {
  await link.start();
  log(`listening for the autopilot on UDP ${MAVLINK_PORT}`);
  server.listen(API_PORT, '127.0.0.1', () => log(`control API on http://127.0.0.1:${API_PORT}`));
  if (WYRD_BRIDGE_TOKEN) {
    new WyrdSync({ serverUrl: WYRD_SERVER_URL, token: WYRD_BRIDGE_TOKEN, link, pilot, log }).start();
    log(`reporting to WYRD at ${WYRD_SERVER_URL}`);
  } else {
    log('WYRD_BRIDGE_TOKEN not set: running locally only, WYRD cannot send missions');
  }
  setInterval(() => {
    const s = link.state;
    if (!s.connected) return log('waiting for the autopilot…');
    log(
      `${s.mode}${s.armed ? ' ARMED' : ''} | alt ${s.relativeAltM?.toFixed(1) ?? '-'} m | ` +
        `bat ${s.batteryPct ?? '-'}% | gps fix ${s.gpsFix ?? '-'} (${s.satellites ?? '-'} sats)`,
    );
  }, 5000);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

process.on('SIGINT', () => {
  pilot.dispose();
  link.stop();
  server.close();
  process.exit(0);
});
