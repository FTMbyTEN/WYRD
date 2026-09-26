const test = require('node:test');
const assert = require('node:assert');
const { checkCommand, checkFlight, DEFAULT_LIMITS } = require('../src/safety');
const { offsetMeters } = require('../src/geo');

const HOME = { lat: 6.5244, lon: 3.3792, altM: 10 };
const now = 1_000_000;
const ready = (over = {}) => ({
  armed: false,
  home: HOME,
  position: { lat: HOME.lat, lon: HOME.lon },
  relativeAltM: 0,
  batteryPct: 90,
  gpsFix: 3,
  lastTelemetryAt: now - 100,
  ...over,
});

test('takeoff is allowed with GPS, battery and a legal altitude', () => {
  assert.deepStrictEqual(checkCommand({ type: 'takeoff', altitudeM: 10 }, ready(), DEFAULT_LIMITS, now), { ok: true });
});

test('takeoff is refused without a 3D fix, on a low battery, or above the ceiling', () => {
  assert.match(checkCommand({ type: 'takeoff', altitudeM: 10 }, ready({ gpsFix: 2 }), DEFAULT_LIMITS, now).reason, /GPS/);
  assert.match(checkCommand({ type: 'takeoff', altitudeM: 10 }, ready({ batteryPct: 40 }), DEFAULT_LIMITS, now).reason, /battery/);
  assert.match(checkCommand({ type: 'takeoff', altitudeM: 500 }, ready(), DEFAULT_LIMITS, now).reason, /ceiling/);
});

test('goto outside the geofence is refused; inside it is allowed', () => {
  const near = offsetMeters(HOME, 100, 50);
  const far = offsetMeters(HOME, 400, 0);
  const flying = ready({ armed: true, relativeAltM: 10 });
  assert.deepStrictEqual(checkCommand({ type: 'goto', ...near, altitudeM: 15 }, flying, DEFAULT_LIMITS, now), { ok: true });
  assert.match(checkCommand({ type: 'goto', ...far, altitudeM: 15 }, flying, DEFAULT_LIMITS, now).reason, /fence/);
});

test('nothing but safe commands is sent on stale telemetry', () => {
  const stale = ready({ armed: true, lastTelemetryAt: now - 10_000 });
  assert.match(checkCommand({ type: 'goto', lat: HOME.lat, lon: HOME.lon, altitudeM: 10 }, stale, DEFAULT_LIMITS, now).reason, /telemetry/);
  for (const type of ['rtl', 'land', 'hold']) {
    assert.deepStrictEqual(checkCommand({ type }, stale, DEFAULT_LIMITS, now), { ok: true });
  }
});

test('unknown and malformed commands are refused', () => {
  assert.equal(checkCommand({ type: 'flip' }, ready(), DEFAULT_LIMITS, now).ok, false);
  assert.equal(checkCommand(null, ready(), DEFAULT_LIMITS, now).ok, false);
});

test('in flight: low battery, leaving the fence, or climbing too high each trigger a return', () => {
  const flying = (over) => ready({ armed: true, relativeAltM: 10, ...over });
  assert.equal(checkFlight(flying(), DEFAULT_LIMITS, now), null);
  assert.match(checkFlight(flying({ batteryPct: 20 }), DEFAULT_LIMITS, now), /battery/);
  assert.match(checkFlight(flying({ position: offsetMeters(HOME, 350, 0) }), DEFAULT_LIMITS, now), /fence/);
  assert.match(checkFlight(flying({ relativeAltM: 80 }), DEFAULT_LIMITS, now), /ceiling/);
  assert.match(checkFlight(flying({ lastTelemetryAt: now - 10_000 }), DEFAULT_LIMITS, now), /telemetry/);
});

test('nothing is flagged while disarmed on the ground', () => {
  assert.equal(checkFlight(ready({ batteryPct: 5 }), DEFAULT_LIMITS, now), null);
});
