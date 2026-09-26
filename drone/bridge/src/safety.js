const { distanceMeters } = require('./geo');

// Conservative defaults for a first drone. Every limit can be tightened per flight, and the
// autopilot's own failsafes (battery, GPS, geofence, lost link) still apply underneath this layer
// -- this is an extra gate in front of WYRD, not a replacement for them.
const DEFAULT_LIMITS = Object.freeze({
  maxAltitudeM: 60, // well under the common 120 m (400 ft) legal ceiling
  minAltitudeM: 2, // never command a cruise point this close to the ground
  geofenceRadiusM: 300, // horizontal distance from home
  minBatteryPct: 30, // below this in flight: return home
  minBatteryForTakeoffPct: 50,
  maxTelemetryAgeMs: 3000, // no fresh data from the drone = don't command it
});

// Commands that only ever make the aircraft safer. They're allowed even when other checks would
// fail (stale telemetry, low battery, outside the fence) -- blocking them would be the unsafe choice.
const SAFE_COMMANDS = new Set(['land', 'rtl', 'hold']);

/**
 * Decides whether [cmd] may be sent to the drone right now.
 * [state] is the bridge's live view of the aircraft (see link.js).
 * Returns { ok: true } or { ok: false, reason }.
 */
function checkCommand(cmd, state, limits = DEFAULT_LIMITS, now = Date.now()) {
  if (!cmd || typeof cmd.type !== 'string') return deny('malformed command');
  if (SAFE_COMMANDS.has(cmd.type)) return { ok: true };

  if (!state.lastTelemetryAt || now - state.lastTelemetryAt > limits.maxTelemetryAgeMs) {
    return deny('no fresh telemetry from the drone');
  }
  if (!state.home) return deny('home position not set yet');

  switch (cmd.type) {
    case 'takeoff': {
      if (!isFiniteNumber(cmd.altitudeM)) return deny('takeoff needs altitudeM');
      if (cmd.altitudeM < limits.minAltitudeM) return deny(`takeoff altitude below ${limits.minAltitudeM} m`);
      if (cmd.altitudeM > limits.maxAltitudeM) return deny(`takeoff altitude above the ${limits.maxAltitudeM} m ceiling`);
      if ((state.gpsFix ?? 0) < 3) return deny('no 3D GPS fix');
      if (state.batteryPct == null || state.batteryPct < limits.minBatteryForTakeoffPct) {
        return deny(`battery below ${limits.minBatteryForTakeoffPct}% for takeoff`);
      }
      return { ok: true };
    }
    case 'goto': {
      if (!isFiniteNumber(cmd.lat) || !isFiniteNumber(cmd.lon) || !isFiniteNumber(cmd.altitudeM)) {
        return deny('goto needs lat, lon and altitudeM');
      }
      if (!state.armed) return deny('drone is not armed / airborne');
      if (cmd.altitudeM < limits.minAltitudeM) return deny(`altitude below ${limits.minAltitudeM} m`);
      if (cmd.altitudeM > limits.maxAltitudeM) return deny(`altitude above the ${limits.maxAltitudeM} m ceiling`);
      const fromHome = distanceMeters(state.home, { lat: cmd.lat, lon: cmd.lon });
      if (fromHome > limits.geofenceRadiusM) {
        return deny(`target is ${Math.round(fromHome)} m from home, outside the ${limits.geofenceRadiusM} m fence`);
      }
      if (state.batteryPct != null && state.batteryPct < limits.minBatteryPct) {
        return deny(`battery below ${limits.minBatteryPct}%`);
      }
      return { ok: true };
    }
    default:
      return deny(`unknown command "${cmd.type}"`);
  }
}

/**
 * Checks the aircraft's live state during a flight. Returns a reason string when it should be
 * brought home (the bridge then commands RTL), or null when all is well.
 */
function checkFlight(state, limits = DEFAULT_LIMITS, now = Date.now()) {
  if (!state.armed) return null;
  if (!state.lastTelemetryAt || now - state.lastTelemetryAt > limits.maxTelemetryAgeMs) {
    return 'lost telemetry';
  }
  if (state.batteryPct != null && state.batteryPct < limits.minBatteryPct) {
    return `battery at ${state.batteryPct}% (minimum ${limits.minBatteryPct}%)`;
  }
  if (state.home && state.position) {
    const fromHome = distanceMeters(state.home, state.position);
    // small margin so GPS jitter at the fence line doesn't trigger a return by itself
    if (fromHome > limits.geofenceRadiusM + 10) return `${Math.round(fromHome)} m from home, outside the fence`;
  }
  if (state.relativeAltM != null && state.relativeAltM > limits.maxAltitudeM + 5) {
    return `altitude ${Math.round(state.relativeAltM)} m, above the ${limits.maxAltitudeM} m ceiling`;
  }
  return null;
}

function deny(reason) {
  return { ok: false, reason };
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

module.exports = { DEFAULT_LIMITS, SAFE_COMMANDS, checkCommand, checkFlight };
