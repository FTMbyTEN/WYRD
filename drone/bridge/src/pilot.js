const { EventEmitter } = require('events');
const { distanceMeters } = require('./geo');
const { DEFAULT_LIMITS, checkCommand, checkFlight } = require('./safety');

const WATCHDOG_MS = 500;
const ARRIVE_RADIUS_M = 2;
const STEP_TIMEOUT_MS = 120000;

/**
 * High-level flying on top of a link (link.js, or a fake in tests). Every command passes through
 * safety.js first; a watchdog checks the live state throughout a flight and brings the drone home
 * (RTL) on any violation.
 *
 * Manual override always wins: if the flight mode changes to anything the pilot didn't ask for
 * (someone flipped a switch on the controller, or a ground station took over), the running mission
 * is cancelled and the pilot stops sending commands -- it never fights a human for control.
 *
 * Emits: 'log' (message), 'mission' (status object), 'override' (mode), 'failsafe' (reason).
 */
class Pilot extends EventEmitter {
  constructor(link, limits = DEFAULT_LIMITS) {
    super();
    this.link = link;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.mission = null; // { steps, index, status, error }
    this.expectedMode = null; // the last mode this pilot itself requested
    this.cancelRequested = false;

    link.on('mode', (mode) => this._onModeChange(mode));
    this.watchdog = setInterval(() => this._watch(), WATCHDOG_MS);
  }

  dispose() {
    clearInterval(this.watchdog);
  }

  get state() {
    return this.link.state;
  }

  /** Runs one command (see safety.js for the shapes). Throws with the reason if it's refused. */
  async execute(cmd) {
    const verdict = checkCommand(cmd, this.state, this.limits);
    if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);

    switch (cmd.type) {
      case 'takeoff':
        await this._setMode('GUIDED');
        await this.link.arm();
        await this.link.takeoff(cmd.altitudeM);
        this._log(`taking off to ${cmd.altitudeM} m`);
        return this._waitFor(() => (this.state.relativeAltM ?? 0) >= cmd.altitudeM * 0.92, 'reach takeoff altitude');
      case 'goto':
        await this._setMode('GUIDED');
        this.link.gotoPosition(cmd.lat, cmd.lon, cmd.altitudeM);
        this._log(`flying to ${cmd.lat.toFixed(6)}, ${cmd.lon.toFixed(6)} at ${cmd.altitudeM} m`);
        return this._waitFor(
          () =>
            this.state.position &&
            distanceMeters(this.state.position, cmd) <= ARRIVE_RADIUS_M &&
            Math.abs((this.state.relativeAltM ?? 0) - cmd.altitudeM) <= 1.5,
          'reach waypoint',
        );
      case 'hold':
        // hold = fly to where we are now, at the current height
        if (this.state.position) {
          await this._setMode('GUIDED');
          this.link.gotoPosition(this.state.position.lat, this.state.position.lon, this.state.relativeAltM ?? 5);
        }
        this._log('holding position');
        return;
      case 'rtl':
        await this._setMode('RTL');
        this._log('returning home');
        return;
      case 'land':
        await this._setMode('LAND');
        this._log('landing');
        return;
      default:
        throw new Error(`unknown command ${cmd.type}`);
    }
  }

  /**
   * Runs [steps] in order. The whole plan is safety-checked up front (as far as it can be before
   * flying), each step again right before it runs, and the watchdog throughout.
   */
  async runMission(steps) {
    if (this.mission?.status === 'running') throw new Error('a mission is already running');
    if (!Array.isArray(steps) || steps.length === 0) throw new Error('mission has no steps');
    this._precheckPlan(steps);

    this.cancelRequested = false;
    this.mission = { steps, index: 0, status: 'running', error: null };
    this._emitMission();
    try {
      for (let i = 0; i < steps.length; i++) {
        if (this.cancelRequested) throw new Error('mission cancelled');
        this.mission.index = i;
        this._emitMission();
        await this.execute(steps[i]);
      }
      this.mission.status = 'done';
    } catch (err) {
      this.mission.status = 'aborted';
      this.mission.error = err.message;
      this._log(`mission aborted: ${err.message}`);
    }
    this._emitMission();
    return this.mission;
  }

  /** Cancels the running mission and returns home. */
  async abort(reason = 'aborted by request') {
    this.cancelRequested = true;
    this._log(reason);
    if (this.state.armed) await this.execute({ type: 'rtl' }).catch((e) => this._log(`RTL failed: ${e.message}`));
  }

  /** Static checks on a whole plan: geofence and altitude of every waypoint, known step types. */
  _precheckPlan(steps) {
    const home = this.state.home;
    for (const [i, step] of steps.entries()) {
      if (!['takeoff', 'goto', 'hold', 'rtl', 'land'].includes(step?.type)) {
        throw new Error(`step ${i + 1}: unknown type "${step?.type}"`);
      }
      const alt = step.altitudeM;
      if (alt != null && (alt < this.limits.minAltitudeM || alt > this.limits.maxAltitudeM)) {
        throw new Error(`step ${i + 1}: altitude ${alt} m is outside ${this.limits.minAltitudeM}-${this.limits.maxAltitudeM} m`);
      }
      if (step.type === 'goto') {
        // without a home position there's nothing to measure the fence from -- refuse, don't skip
        if (!home) throw new Error(`step ${i + 1}: home position not known yet, can't check the geofence`);
        const d = distanceMeters(home, step);
        if (d > this.limits.geofenceRadiusM) {
          throw new Error(`step ${i + 1}: waypoint is ${Math.round(d)} m from home, outside the ${this.limits.geofenceRadiusM} m fence`);
        }
      }
    }
  }

  async _setMode(mode) {
    this.expectedMode = mode;
    if (this.state.mode === mode) return;
    await this.link.setMode(mode);
  }

  _onModeChange(mode) {
    if (this.mission?.status !== 'running') return;
    if (mode === this.expectedMode) return;
    // Someone else changed the mode: hand over completely.
    this.cancelRequested = true;
    this._log(`manual override detected (mode ${mode}); mission cancelled, bridge standing down`);
    this.emit('override', mode);
  }

  _watch() {
    const reason = checkFlight(this.state, this.limits);
    if (!reason || this.failsafeActive) return;
    if (this.state.mode === 'RTL' || this.state.mode === 'LAND') return; // already coming down
    this.failsafeActive = true;
    this.emit('failsafe', reason);
    this.abort(`failsafe: ${reason}`).finally(() => {
      this.failsafeActive = false;
    });
  }

  _waitFor(predicate, label) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (this.cancelRequested) {
          clearInterval(tick);
          reject(new Error('mission cancelled'));
        } else if (predicate()) {
          clearInterval(tick);
          resolve();
        } else if (Date.now() - started > STEP_TIMEOUT_MS) {
          clearInterval(tick);
          reject(new Error(`timed out waiting to ${label}`));
        }
      }, 200);
    });
  }

  _emitMission() {
    this.emit('mission', { ...this.mission, steps: this.mission.steps.length });
  }

  _log(message) {
    this.emit('log', message);
  }
}

module.exports = { Pilot };
