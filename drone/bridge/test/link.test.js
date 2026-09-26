// Real UDP + real MAVLink bytes against a tiny fake autopilot, so the encoding/decoding and the
// command/acknowledgement handshake are exercised without needing the simulator.
const test = require('node:test');
const assert = require('node:assert');
const dgram = require('dgram');
const { MavLinkPacketSplitter, MavLinkPacketParser, MavLinkProtocolV2, minimal, common, ardupilotmega } = require('node-mavlink');
const { MavlinkLink } = require('../src/link');

const REGISTRY = { ...minimal.REGISTRY, ...common.REGISTRY };

function fakeAutopilot(bridgePort) {
  const socket = dgram.createSocket('udp4');
  const proto = new MavLinkProtocolV2(1, 1); // sysid 1, compid 1 = the vehicle
  let seq = 0;
  const received = [];
  const send = (msg) => socket.send(proto.serialize(msg, seq++ % 256), bridgePort, '127.0.0.1');

  const splitter = new MavLinkPacketSplitter();
  splitter.pipe(new MavLinkPacketParser()).on('data', (packet) => {
    const clazz = REGISTRY[packet.header.msgid];
    if (!clazz) return;
    const data = packet.protocol.data(packet.payload, clazz);
    received.push(data);
    if (packet.header.msgid === common.CommandLong.MSG_ID) {
      const ack = new common.CommandAck();
      ack.command = data.command;
      ack.result = common.MavResult.ACCEPTED;
      send(ack);
    }
  });
  socket.on('message', (m) => splitter.write(m));

  return {
    received,
    start: () => new Promise((r) => socket.bind(0, '127.0.0.1', r)),
    heartbeat(mode, armed) {
      const hb = new minimal.Heartbeat();
      hb.type = minimal.MavType.QUADROTOR;
      hb.autopilot = minimal.MavAutopilot.ARDUPILOTMEGA;
      hb.baseMode = minimal.MavModeFlag.CUSTOM_MODE_ENABLED | (armed ? minimal.MavModeFlag.SAFETY_ARMED : 0);
      hb.customMode = ardupilotmega.CopterMode[mode];
      hb.systemStatus = minimal.MavState.STANDBY;
      hb.mavlinkVersion = 3;
      send(hb);
    },
    position(lat, lon, relAltM) {
      const p = new common.GlobalPositionInt();
      p.lat = Math.round(lat * 1e7);
      p.lon = Math.round(lon * 1e7);
      p.relativeAlt = Math.round(relAltM * 1000);
      p.hdg = 9000;
      send(p);
    },
    battery(pct) {
      const s = new common.SysStatus();
      s.batteryRemaining = pct;
      s.voltageBattery = 12600;
      send(s);
    },
    close: () => socket.close(),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the link decodes autopilot telemetry and gets commands acknowledged', async () => {
  const link = new MavlinkLink({ port: 0, bindAddress: '127.0.0.1' });
  await link.start();
  const port = link.socket.address().port;
  const vehicle = fakeAutopilot(port);
  await vehicle.start();

  const modes = [];
  link.on('mode', (m) => modes.push(m));

  vehicle.heartbeat('STABILIZE', false);
  vehicle.position(6.5244, 3.3792, 12.5);
  vehicle.battery(87);
  await wait(150);

  assert.equal(link.state.connected, true);
  assert.equal(link.state.mode, 'STABILIZE');
  assert.equal(link.state.armed, false);
  assert.deepStrictEqual(link.state.position, { lat: 6.5244, lon: 3.3792 });
  assert.equal(link.state.relativeAltM, 12.5);
  assert.equal(link.state.headingDeg, 90);
  assert.equal(link.state.batteryPct, 87);

  // commands round-trip: COMMAND_LONG out, COMMAND_ACK back
  await link.setMode('GUIDED');
  await link.arm();
  await link.takeoff(10);
  link.gotoPosition(6.525, 3.38, 15);
  await wait(150);

  const commands = vehicle.received.filter((m) => m instanceof common.CommandLong).map((m) => m.command);
  assert.ok(commands.includes(common.MavCmd.DO_SET_MODE));
  assert.ok(commands.includes(common.MavCmd.COMPONENT_ARM_DISARM));
  assert.ok(commands.includes(common.MavCmd.NAV_TAKEOFF));
  const target = vehicle.received.find((m) => m instanceof common.SetPositionTargetGlobalInt);
  assert.equal(target.latInt, 65250000);
  assert.equal(target.alt, 15);

  const setMode = vehicle.received.find((m) => m instanceof common.CommandLong && m.command === common.MavCmd.DO_SET_MODE);
  assert.equal(setMode._param2, ardupilotmega.CopterMode.GUIDED);

  vehicle.heartbeat('GUIDED', true);
  await wait(100);
  assert.equal(link.state.armed, true);
  assert.deepStrictEqual(modes, ['STABILIZE', 'GUIDED']);

  link.stop();
  vehicle.close();
});
