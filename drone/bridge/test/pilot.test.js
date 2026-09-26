const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Pilot } = require('../src/pilot');
const { offsetMeters } = require('../src/geo');

const HOME = { lat: 6.5244, lon: 3.3792, altM: 10 };

/** A pretend autopilot: accepts commands and moves the aircraft a little every 50 ms. */
class FakeLink extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.target = null;
    this.state = {
      connected: true, armed: false, mode: 'STABILIZE', home: HOME,
      position: { lat: HOME.lat, lon: HOME.lon }, relativeAltM: 0,
      batteryPct: 90, gpsFix: 3, lastTelemetryAt: Date.now(),
    };
    this.timer = setInterval(() => this._step(), 50);
  }
  _step() {
    const s = this.state;
    s.lastTelemetryAt = Date.now();
    if (this.target) {
      const k = 0.5; // close half the remaining gap each tick
      s.position = {
        lat: s.position.lat + (this.target.lat - s.position.lat) * k,
        lon: s.position.lon + (this.target.lon - s.position.lon) * k,
      };
      s.relativeAltM += (this.target.alt - s.relativeAltM) * k;
    }
  }
  _mode(mode) {
    const prev = this.state.mode;
    this.state.mode = mode;
    this.emit('mode', mode, prev);
  }
  async setMode(mode) { this.sent.push(`mode:${mode}`); this._mode(mode); if (mode === 'RTL' || mode === 'LAND') this.target = { ...HOME, alt: 0 }; }
  async arm() { this.sent.push('arm'); this.state.armed = true; }
  async takeoff(alt) { this.sent.push(`takeoff:${alt}`); this.target = { ...this.state.position, alt }; }
  gotoPosition(lat, lon, alt) { this.sent.push('goto'); this.target = { lat, lon, alt }; }
  close() { clearInterval(this.timer); }
}

function setup() {
  const link = new FakeLink();
  const pilot = new Pilot(link);
  return { link, pilot, done: () => { pilot.dispose(); link.close(); } };
}

test('a mission takes off, flies its waypoints in order, and comes home', async () => {
  const { link, pilot, done } = setup();
  const a = offsetMeters(HOME, 30, 0);
  const b = offsetMeters(HOME, 30, 30);
  const result = await pilot.runMission([
    { type: 'takeoff', altitudeM: 10 },
    { type: 'goto', ...a, altitudeM: 12 },
    { type: 'goto', ...b, altitudeM: 12 },
    { type: 'rtl' },
  ]);
  done();
  assert.equal(result.status, 'done', result.error);
  assert.deepStrictEqual(link.sent, ['mode:GUIDED', 'arm', 'takeoff:10', 'goto', 'goto', 'mode:RTL']);
});

test('a plan with a waypoint outside the fence is rejected before anything is sent', async () => {
  const { link, pilot, done } = setup();
  await assert.rejects(
    pilot.runMission([{ type: 'takeoff', altitudeM: 10 }, { type: 'goto', ...offsetMeters(HOME, 500, 0), altitudeM: 10 }]),
    /outside the 300 m fence/,
  );
  done();
  assert.deepStrictEqual(link.sent, []);
});

test('a manual mode change cancels the mission and the pilot stops commanding', async () => {
  const { link, pilot, done } = setup();
  const overrides = [];
  pilot.on('override', (m) => overrides.push(m));
  const running = pilot.runMission([
    { type: 'takeoff', altitudeM: 10 },
    { type: 'goto', ...offsetMeters(HOME, 100, 0), altitudeM: 10 },
  ]);
  await new Promise((r) => setTimeout(r, 60));
  link._mode('LOITER'); // a human flips the mode switch
  const result = await running;
  const sentAfterOverride = link.sent.length;
  await new Promise((r) => setTimeout(r, 300));
  done();
  assert.equal(result.status, 'aborted');
  assert.deepStrictEqual(overrides, ['LOITER']);
  assert.equal(link.sent.length, sentAfterOverride, 'no commands after the override');
  assert.ok(!link.sent.includes('goto'), 'never flew the second step');
});

test('the watchdog returns home when the battery runs low in flight', async () => {
  const { link, pilot, done } = setup();
  const failsafes = [];
  pilot.on('failsafe', (r) => failsafes.push(r));
  link.state.armed = true;
  link.state.relativeAltM = 10;
  link.state.batteryPct = 25;
  await new Promise((r) => setTimeout(r, 700));
  done();
  assert.match(failsafes[0], /battery/);
  assert.ok(link.sent.includes('mode:RTL'));
});
