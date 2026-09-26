// Keeps the bridge in touch with the WYRD server (Serverpod): reports telemetry every couple of
// seconds and picks up missions WYRD planned for this drone. Missions are run by the Pilot, so the
// bridge's own safety checks apply again on top of the server's.
//
// The server is reached over plain HTTPS using Serverpod's wire format:
//   POST {server}/{endpoint}/{method}  with a JSON body of the method's arguments.

const REPORT_MS = 2000;

class WyrdSync {
  constructor({ serverUrl, token, droneId = 'wyrd-1', link, pilot, log = () => {}, fetchImpl = fetch }) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.token = token;
    this.droneId = droneId;
    this.link = link;
    this.pilot = pilot;
    this.log = log;
    this.fetch = fetchImpl;
    this.activeMissionId = null;
    this.lastError = null;

    pilot.on('mission', (m) => {
      if (this.activeMissionId == null) return;
      if (m.status === 'done' || m.status === 'aborted') {
        this._update(this.activeMissionId, m.status, m.error ?? null);
        this.activeMissionId = null;
      }
    });
  }

  start() {
    this.timer = setInterval(() => this.tick(), REPORT_MS);
    return this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  async tick() {
    try {
      const mission = await this._call('droneBridge', 'report', { token: this.token, state: this._stateForServer() });
      if (this.lastError) this.log('WYRD server reachable again');
      this.lastError = null;
      if (mission) await this._handle(mission);
    } catch (e) {
      // log once per distinct error, not every 2 seconds
      if (e.message !== this.lastError) this.log(`WYRD server: ${e.message}`);
      this.lastError = e.message;
    }
  }

  async _handle(mission) {
    let steps;
    try {
      steps = JSON.parse(mission.stepsJson);
    } catch {
      return this._update(mission.id, 'rejected', 'unreadable steps');
    }

    if (mission.kind === 'abort') {
      this.log('WYRD: abort received');
      await this.pilot.abort('abort requested by WYRD operator');
      return this._update(mission.id, 'done', null);
    }

    this.log(`WYRD mission #${mission.id}: ${mission.summary}`);
    if (this.pilot.mission?.status === 'running') {
      return this._update(mission.id, 'rejected', 'the bridge is already flying a mission');
    }
    try {
      this.pilot._precheckPlan(steps); // the bridge's own gate, independent of the server's
    } catch (e) {
      return this._update(mission.id, 'rejected', e.message);
    }
    this.activeMissionId = mission.id;
    await this._update(mission.id, 'running', null);
    this.pilot.runMission(steps).catch((e) => this.log(`mission failed: ${e.message}`));
  }

  _update(missionId, status, reason) {
    return this._call('droneBridge', 'missionUpdate', { token: this.token, missionId, status, reason }).catch((e) =>
      this.log(`could not report mission #${missionId} ${status}: ${e.message}`),
    );
  }

  _stateForServer() {
    const s = this.link.state;
    const m = this.pilot.mission;
    return {
      droneId: this.droneId,
      connected: Boolean(s.connected),
      armed: Boolean(s.armed),
      mode: s.mode,
      lat: s.position?.lat ?? null,
      lon: s.position?.lon ?? null,
      relativeAltM: s.relativeAltM,
      headingDeg: s.headingDeg,
      groundSpeedMs: s.groundSpeedMs,
      batteryPct: s.batteryPct,
      gpsFix: s.gpsFix,
      satellites: s.satellites,
      homeLat: s.home?.lat ?? null,
      homeLon: s.home?.lon ?? null,
      missionStatus: m?.status ?? 'idle',
      missionStep: m ? m.index + 1 : null,
      missionError: m?.error ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  async _call(endpoint, method, args) {
    const res = await this.fetch(`${this.serverUrl}/${endpoint}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${endpoint}.${method} ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    return text ? JSON.parse(text) : null;
  }
}

module.exports = { WyrdSync };
