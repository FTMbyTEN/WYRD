const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Pilot } = require('../src/pilot');
const { WyrdSync } = require('../src/wyrd-sync');
const { offsetMeters } = require('../src/geo');

const HOME = { lat: 6.5244, lon: 3.3792, altM: 10 };

class FakeLink extends EventEmitter {
  constructor() {
    super();
    this.target = null;
    this.state = {
      connected: true, armed: false, mode: 'STABILIZE', home: HOME,
      position: { lat: HOME.lat, lon: HOME.lon }, relativeAltM: 0,
      batteryPct: 90, gpsFix: 3, lastTelemetryAt: Date.now(),
    };
    this.timer = setInterval(() => {
      const s = this.state;
      s.lastTelemetryAt = Date.now();
      if (!this.target) return;
      s.position = { lat: s.position.lat + (this.target.lat - s.position.lat) * 0.5, lon: s.position.lon + (this.target.lon - s.position.lon) * 0.5 };
      s.relativeAltM += (this.target.alt - s.relativeAltM) * 0.5;
    }, 50);
  }
  async setMode(mode) { const prev = this.state.mode; this.state.mode = mode; this.emit('mode', mode, prev); if (mode === 'RTL') this.target = { ...HOME, alt: 0 }; }
  async arm() { this.state.armed = true; }
  async takeoff(alt) { this.target = { ...this.state.position, alt }; }
  gotoPosition(lat, lon, alt) { this.target = { lat, lon, alt }; }
  close() { clearInterval(this.timer); }
}

/** A stand-in for the Serverpod droneBridge endpoint: hands out queued missions, records updates. */
function fakeServer(queue) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const method = url.split('/').slice(-2).join('.');
    calls.push({ method, body });
    const reply = method === 'droneBridge.report' ? queue.shift() ?? null : null;
    return { ok: true, status: 200, text: async () => (reply ? JSON.stringify(reply) : '') };
  };
  return { calls, fetchImpl, updates: () => calls.filter((c) => c.method === 'droneBridge.missionUpdate').map((c) => [c.body.missionId, c.body.status, c.body.reason]) };
}

const mission = (id, steps, kind = 'mission') => ({ id, kind, summary: `mission ${id}`, stepsJson: JSON.stringify(steps) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(queue) {
  const link = new FakeLink();
  const pilot = new Pilot(link);
  const server = fakeServer(queue);
  const sync = new WyrdSync({ serverUrl: 'https://wyrd.test/', token: 't', link, pilot, fetchImpl: server.fetchImpl });
  return { link, pilot, server, sync, done: () => { pilot.dispose(); link.close(); } };
}

test('reports state in the server\'s DroneState shape', async () => {
  const { server, sync, done } = setup([]);
  await sync.tick();
  done();
  const report = server.calls[0];
  assert.equal(report.method, 'droneBridge.report');
  assert.equal(report.body.token, 't');
  assert.equal(report.body.state.droneId, 'wyrd-1');
  assert.equal(report.body.state.homeLat, HOME.lat);
  assert.equal(report.body.state.missionStatus, 'idle');
  assert.ok(!Number.isNaN(Date.parse(report.body.state.updatedAt)));
});

test('a mission from WYRD is flown and reported running then done', async () => {
  const steps = [
    { type: 'takeoff', altitudeM: 10 },
    { type: 'goto', ...offsetMeters(HOME, 20, 0), altitudeM: 10 },
    { type: 'rtl' },
  ];
  const { server, sync, done } = setup([mission(7, steps)]);
  await sync.tick();
  await wait(1500);
  done();
  assert.deepStrictEqual(server.updates(), [[7, 'running', null], [7, 'done', null]]);
});

test('the bridge rejects a server mission that breaks its own limits, without flying', async () => {
  const { link, server, sync, done } = setup([mission(8, [{ type: 'takeoff', altitudeM: 10 }, { type: 'goto', ...offsetMeters(HOME, 900, 0), altitudeM: 10 }])]);
  await sync.tick();
  await wait(100);
  done();
  const [[id, status, reason]] = server.updates();
  assert.equal(id, 8);
  assert.equal(status, 'rejected');
  assert.match(reason, /fence/);
  assert.equal(link.state.armed, false);
});

test('an abort from WYRD cancels the flight and returns home', async () => {
  const steps = [{ type: 'takeoff', altitudeM: 10 }, { type: 'goto', ...offsetMeters(HOME, 150, 0), altitudeM: 10 }, { type: 'rtl' }];
  const queue = [mission(9, steps)];
  const { link, server, sync, done } = setup(queue);
  await sync.tick();
  await wait(200);
  queue.push(mission(10, [{ type: 'rtl' }], 'abort'));
  await sync.tick();
  await wait(300);
  done();
  assert.equal(link.state.mode, 'RTL');
  const updates = server.updates();
  assert.deepStrictEqual(updates.find((u) => u[0] === 10), [10, 'done', null]);
  assert.equal(updates.find((u) => u[0] === 9 && u[1] === 'aborted')?.[1], 'aborted');
});

test('server outages are logged once, not every tick', async () => {
  const link = new FakeLink();
  const pilot = new Pilot(link);
  const logs = [];
  const sync = new WyrdSync({
    serverUrl: 'https://wyrd.test', token: 't', link, pilot, log: (m) => logs.push(m),
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await sync.tick();
  await sync.tick();
  await sync.tick();
  pilot.dispose();
  link.close();
  assert.equal(logs.length, 1);
});
