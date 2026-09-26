const dgram = require('dgram');
const { EventEmitter } = require('events');
const {
  MavLinkPacketSplitter,
  MavLinkPacketParser,
  MavLinkProtocolV2,
  minimal,
  common,
  ardupilotmega,
} = require('node-mavlink');

const REGISTRY = { ...minimal.REGISTRY, ...common.REGISTRY, ...ardupilotmega.REGISTRY };

// ArduCopter flight modes by name (Heartbeat.customMode carries the number).
const COPTER_MODES = ardupilotmega.CopterMode;
const MODE_NAMES = Object.fromEntries(
  Object.entries(COPTER_MODES).filter(([, v]) => typeof v === 'number').map(([k, v]) => [v, k]),
);

const ACK_TIMEOUT_MS = 3000;
// Telemetry we want, and how often (Hz). Requested once the autopilot is found.
const STREAMS = [
  [common.GlobalPositionInt.MSG_ID, 4],
  [common.SysStatus.MSG_ID, 1],
  [common.GpsRawInt.MSG_ID, 1],
  [common.HomePosition.MSG_ID, 0.5],
];

/**
 * The bridge's MAVLink connection to one autopilot over UDP -- the only part of the bridge that
 * speaks MAVLink. Keeps [state] current from incoming telemetry and exposes a few primitive
 * commands. It does no safety checking itself: Pilot (pilot.js) gates everything through
 * safety.js before calling these.
 *
 * Emits: 'connected', 'state' (after each telemetry update), 'mode' (name, previous name).
 */
class MavlinkLink extends EventEmitter {
  constructor({ port = 14550, bindAddress = '0.0.0.0', sysid = 255, compid = 190 } = {}) {
    super();
    this.port = port;
    this.bindAddress = bindAddress;
    this.protocol = new MavLinkProtocolV2(sysid, compid); // we identify as a ground station
    this.seq = 0;
    this.remote = null; // { address, port } of the autopilot, learned from its first packet
    this.target = { system: 1, component: 1 };
    this.pendingAcks = new Map(); // command id -> resolver
    this.state = {
      connected: false,
      armed: false,
      mode: null,
      position: null, // { lat, lon }
      relativeAltM: null,
      headingDeg: null,
      groundSpeedMs: null,
      batteryPct: null,
      batteryV: null,
      gpsFix: null,
      satellites: null,
      home: null, // { lat, lon, altM }
      lastTelemetryAt: null,
    };
  }

  start() {
    this.socket = dgram.createSocket('udp4');
    const splitter = new MavLinkPacketSplitter();
    const parser = new MavLinkPacketParser();
    splitter.pipe(parser).on('data', (packet) => this._onPacket(packet));

    this.socket.on('message', (msg, rinfo) => {
      if (!this.remote) this.remote = { address: rinfo.address, port: rinfo.port };
      splitter.write(msg);
    });
    return new Promise((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.bind(this.port, this.bindAddress, () => {
        this.socket.off('error', reject);
        this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), 1000);
        resolve();
      });
    });
  }

  stop() {
    clearInterval(this.heartbeatTimer);
    this.socket?.close();
  }

  _onPacket(packet) {
    const clazz = REGISTRY[packet.header.msgid];
    if (!clazz) return;
    // only listen to the autopilot itself, not other ground stations on the same link
    if (packet.header.compid !== 1) return;
    const data = packet.protocol.data(packet.payload, clazz);
    const s = this.state;
    const now = Date.now();

    switch (packet.header.msgid) {
      case minimal.Heartbeat.MSG_ID: {
        if (data.autopilot === minimal.MavAutopilot.INVALID) return; // another GCS, not a vehicle
        this.target = { system: packet.header.sysid, component: packet.header.compid };
        const mode = MODE_NAMES[data.customMode] ?? `MODE_${data.customMode}`;
        const previous = s.mode;
        s.armed = Boolean(data.baseMode & minimal.MavModeFlag.SAFETY_ARMED);
        s.mode = mode;
        s.lastTelemetryAt = now;
        if (!s.connected) {
          s.connected = true;
          this._requestStreams();
          this.emit('connected');
        }
        if (previous !== mode) this.emit('mode', mode, previous);
        break;
      }
      case common.GlobalPositionInt.MSG_ID:
        s.position = { lat: data.lat / 1e7, lon: data.lon / 1e7 };
        s.relativeAltM = data.relativeAlt / 1000;
        s.headingDeg = data.hdg === 65535 ? null : data.hdg / 100;
        s.groundSpeedMs = Math.hypot(data.vx, data.vy) / 100;
        s.lastTelemetryAt = now;
        break;
      case common.SysStatus.MSG_ID:
        s.batteryPct = data.batteryRemaining >= 0 ? data.batteryRemaining : null;
        s.batteryV = data.voltageBattery === 65535 ? null : data.voltageBattery / 1000;
        s.lastTelemetryAt = now;
        break;
      case common.GpsRawInt.MSG_ID:
        s.gpsFix = data.fixType;
        s.satellites = data.satellitesVisible;
        break;
      case common.HomePosition.MSG_ID:
        s.home = { lat: data.latitude / 1e7, lon: data.longitude / 1e7, altM: data.altitude / 1000 };
        break;
      case common.CommandAck.MSG_ID: {
        const resolve = this.pendingAcks.get(data.command);
        if (resolve) {
          this.pendingAcks.delete(data.command);
          resolve(data.result);
        }
        return;
      }
      default:
        return;
    }
    this.emit('state', s);
  }

  _send(message) {
    if (!this.remote) return;
    const buffer = this.protocol.serialize(message, this.seq);
    this.seq = (this.seq + 1) % 256;
    this.socket.send(buffer, this.remote.port, this.remote.address);
  }

  _sendHeartbeat() {
    const hb = new minimal.Heartbeat();
    hb.type = minimal.MavType.GCS;
    hb.autopilot = minimal.MavAutopilot.INVALID;
    hb.baseMode = 0;
    hb.customMode = 0;
    hb.systemStatus = minimal.MavState.ACTIVE;
    hb.mavlinkVersion = 3;
    this._send(hb);
  }

  _requestStreams() {
    for (const [msgId, hz] of STREAMS) {
      this.command(common.MavCmd.SET_MESSAGE_INTERVAL, [msgId, Math.round(1e6 / hz)]).catch(() => {});
    }
  }

  /**
   * Sends COMMAND_LONG and resolves with the autopilot's MavResult (0 = accepted), or rejects if
   * no acknowledgement arrives in time.
   */
  command(commandId, params = []) {
    const msg = new common.CommandLong();
    msg.targetSystem = this.target.system;
    msg.targetComponent = this.target.component;
    msg.command = commandId;
    msg.confirmation = 0;
    [msg._param1, msg._param2, msg._param3, msg._param4, msg._param5, msg._param6, msg._param7] = [
      ...params,
      0, 0, 0, 0, 0, 0, 0,
    ].slice(0, 7);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(commandId);
        reject(new Error(`no acknowledgement for command ${commandId}`));
      }, ACK_TIMEOUT_MS);
      this.pendingAcks.set(commandId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this._send(msg);
    });
  }

  async setMode(name) {
    const modeNumber = COPTER_MODES[name];
    if (typeof modeNumber !== 'number') throw new Error(`unknown copter mode ${name}`);
    return this._expectAccepted(
      common.MavCmd.DO_SET_MODE,
      [minimal.MavModeFlag.CUSTOM_MODE_ENABLED, modeNumber],
      `set mode ${name}`,
    );
  }

  arm() {
    return this._expectAccepted(common.MavCmd.COMPONENT_ARM_DISARM, [1], 'arm');
  }

  takeoff(altitudeM) {
    return this._expectAccepted(common.MavCmd.NAV_TAKEOFF, [0, 0, 0, NaN, NaN, NaN, altitudeM], 'takeoff');
  }

  /** Fly to a point (GUIDED mode), altitude relative to home. */
  gotoPosition(lat, lon, altitudeM) {
    const msg = new common.SetPositionTargetGlobalInt();
    msg.timeBootMs = 0;
    msg.targetSystem = this.target.system;
    msg.targetComponent = this.target.component;
    msg.coordinateFrame = common.MavFrame.GLOBAL_RELATIVE_ALT_INT;
    msg.typeMask = 0b0000111111111000; // use position only; ignore velocity, acceleration, yaw
    msg.latInt = Math.round(lat * 1e7);
    msg.lonInt = Math.round(lon * 1e7);
    msg.alt = altitudeM;
    this._send(msg);
  }

  async _expectAccepted(commandId, params, label) {
    const result = await this.command(commandId, params);
    if (result !== common.MavResult.ACCEPTED) {
      throw new Error(`${label} rejected by the autopilot (${common.MavResult[result] ?? result})`);
    }
  }
}

module.exports = { MavlinkLink };
