import * as THREE from 'three';
import { api } from '../api/client';
import type { CityWallet } from '../api/types';
import { dirAt, pointAt, type OsmCity } from './osmCity';
import type { Router } from './routes';
import { along } from './routes';
import type { Place } from './places';
import { makeDanfo, makeOkada } from './vehicles';

/**
 * Jobs with real play:
 *  - delivery: collect a parcel at a real place nearby, take it to another across town before time runs out
 *  - danfo: a danfo appears beside you; drive it yourself (W/S, A/D) and stop at the next real bus stops,
 *    where passengers get on and pay
 *  - chase: a phone snatcher on an okada; catch them inside 90 s, on foot or in the hover-car
 * The server starts and times each job and pays it; this runs it in the world.
 */
export type JobType = 'delivery' | 'danfo' | 'chase';
export type JobView = { type: JobType; title: string; line: string; timeLeft: number | null; passengers?: number };

type Ctx = {
  scene: THREE.Scene;
  city: OsmCity;
  router: Router;
  places: () => Place[];
  pos: () => THREE.Vector3;
  keys: () => Set<string>;
  stick: () => { x: number; y: number };
  say: (s: string) => void;
  waypoint: (x: number, z: number, title: string, brief: string) => void;
  clearWaypoint: () => void;
  wallet: (w: CityWallet) => void;
  view: (v: JobView | null) => void;
};

export function makeJobs(ctx: Ctx) {
  let job: null | {
    type: JobType; id: string | null; started: number;
    // delivery
    pickup?: THREE.Vector2; drop?: THREE.Vector2; pickName?: string; dropName?: string; carrying?: boolean; dist?: number; limit?: number;
    // danfo
    stops?: { x: number; z: number; name: string }[]; next?: number; passengers?: number; still?: number;
    // chase
    thief?: { mesh: THREE.Group; path: ReturnType<Router['route']>; s: number; speed: number };
  } = null;

  // the danfo you drive: one model, reused
  const bus = makeDanfo(true);
  bus.group.visible = false;
  ctx.scene.add(bus.group);
  const drive = { on: false, pos: new THREE.Vector3(), yaw: 0, speed: 0 };
  // the snatcher's okada
  const okada = makeOkada(true);
  okada.group.visible = false;
  ctx.scene.add(okada.group);

  // a job picked from the map waits until the streets round you are in (bus stops, roads)
  let pending: { type: JobType; until: number } | null = null;
  const view = () => {
    if (!job) { ctx.view(null); return; }
    const t = job.limit ? Math.max(0, Math.round(job.limit - (performance.now() - job.started) / 1000)) : job.type === 'chase' ? Math.max(0, Math.round(90 - (performance.now() - job.started) / 1000)) : null;
    if (job.type === 'delivery') ctx.view({ type: 'delivery', title: 'DELIVERY', line: job.carrying ? `Take it to ${job.dropName}` : `Collect the parcel at ${job.pickName}`, timeLeft: t });
    else if (job.type === 'danfo') ctx.view({ type: 'danfo', title: 'DANFO RUN', line: !drive.on ? 'Get in the danfo (E)' : job.next! < job.stops!.length ? `Next stop: ${job.stops![job.next!].name} -- stop there` : 'Route done', timeLeft: null, passengers: job.passengers });
    else ctx.view({ type: 'chase', title: 'CHASE', line: 'Catch the phone snatcher on the okada!', timeLeft: t });
  };

  const end = (msg?: string) => {
    if (msg) ctx.say(msg);
    if (job?.thief) okada.group.visible = false;
    if (drive.on) { drive.on = false; ctx.pos().set(drive.pos.x + Math.cos(drive.yaw) * 2.6, 0.2, drive.pos.z - Math.sin(drive.yaw) * 2.6); } // out the side door
    bus.group.visible = false;
    job = null;
    ctx.clearWaypoint();
    view();
  };
  const finish = (dist: number, passengers: number) => {
    const j = job!;
    end();
    if (!j.id) { ctx.say('Job done -- sign in to get paid.'); return; }
    api.cityJobFinish(j.id, Math.round(dist), passengers, Math.round(j.limit ?? 0))
      .then((r) => { if ('error' in r) ctx.say(r.error); else { ctx.wallet(r); ctx.say(`${r.note} +₦${r.paid.toLocaleString('en-NG')}.`); } })
      .catch(() => ctx.say('The pay did not come through.'));
  };

  const pickPlace = (from: THREE.Vector3, min: number, max: number) => {
    // named places, and the bus stops too (the map is thin in places)
    const all: { x: number; z: number; n: string | null }[] = [...ctx.places().filter((p) => p.n), ...ctx.router.stops.map((st) => ({ x: st.x, z: st.z, n: `${st.name} bus stop` }))];
    const ok = all.filter((p) => { const d = Math.hypot(p.x - from.x, p.z - from.z); return d > min && d < max; });
    return ok[Math.floor(Math.random() * ok.length)] ?? null;
  };

  return {
    get active() { return job?.type ?? null; },
    /** The danfo you're driving, if any: where you sit and which way you face. */
    driving() { return drive.on ? { pos: drive.pos, yaw: drive.yaw, speed: drive.speed } : null; },

    start(type: JobType) {
      if (job) end();
      if (ctx.router.stops.length < 3) {
        if (!pending) ctx.say('Finding you a job on the street…');
        pending = { type, until: performance.now() + 15000 };
        return;
      }
      pending = null;
      const p = ctx.pos();
      job = { type, id: null, started: performance.now() };
      api.cityJobStart(type).then((r) => { if (job && !('error' in r)) job.id = r.id; }).catch(() => {});
      if (type === 'delivery') {
        const a = pickPlace(p, 60, 900), b = a && pickPlace(new THREE.Vector3(a.x, 0, a.z), 600, 2600);
        if (!a || !b) { end('No deliveries round here right now.'); return; }
        job.pickup = new THREE.Vector2(a.x, a.z); job.drop = new THREE.Vector2(b.x, b.z);
        job.pickName = a.n!; job.dropName = b.n!;
        job.dist = Math.hypot(a.x - b.x, a.z - b.z);
        job.limit = Math.round(Math.hypot(a.x - p.x, a.z - p.z) / 5 + job.dist / 5 + 90); // a runner's pace, plus slack
        ctx.waypoint(a.x, a.z, `Collect: ${a.n}`, 'A parcel is waiting. Get it.');
        ctx.say(`Delivery: collect at ${a.n}, take it to ${b.n}. ${job.limit}s on the clock.`);
      } else if (type === 'danfo') {
        const nr = ctx.city.nearestRoad(p.x, p.z, (r) => r.kind <= 4);
        if (!nr || ctx.router.stops.length < 3) { end('No danfo route here -- find a main road.'); return; }
        // the danfo waits on the road beside you, pointing along it
        const q = pointAt(nr.road, nr.s), d = dirAt(nr.road, nr.s);
        drive.pos.set(q.x, 0.05, q.y);
        drive.yaw = Math.atan2(d.x, d.y); drive.speed = 0;
        bus.group.position.copy(drive.pos); bus.group.rotation.y = drive.yaw - Math.PI / 2; bus.group.visible = true;
        // four stops, each the nearest unvisited one to the last, within reach
        const stops: { x: number; z: number; name: string }[] = [];
        let from = { x: drive.pos.x, z: drive.pos.z };
        const pool = ctx.router.stops.filter((st) => Math.hypot(st.x - p.x, st.z - p.z) < 2500);
        for (let k = 0; k < 4 && pool.length; k++) {
          pool.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
          const nx = pool.find((st) => Math.hypot(st.x - from.x, st.z - from.z) > 150);
          if (!nx) break;
          stops.push(nx); pool.splice(pool.indexOf(nx), 1); from = nx;
        }
        if (stops.length < 2) { end('No bus stops near enough for a run.'); return; }
        job.stops = stops; job.next = 0; job.passengers = 0; job.still = 0;
        ctx.say('Your danfo is on the road beside you. Get in (E), drive W/S, steer A/D, stop at each bus stop.');
      } else {
        // the snatcher starts on the road just ahead and flees towards a stop 300-900 m off (inside the loaded streets)
        const nr = ctx.city.nearestRoad(p.x + 25, p.z, (r) => r.kind <= 6);
        const start = nr ? pointAt(nr.road, nr.s) : new THREE.Vector2(p.x + 25, p.z);
        const far = ctx.router.stops.filter((st) => { const d = Math.hypot(st.x - start.x, st.z - start.y); return d > 300 && d < 900; });
        let path: ReturnType<Router['route']> = null;
        for (const target of far.sort(() => Math.random() - 0.5).slice(0, 4)) { path = ctx.router.route(start.x, start.y, target.x, target.z); if (path) break; }
        if (!path) { end('The snatcher got away before you saw them.'); return; }
        job.thief = { mesh: okada.group, path, s: 0, speed: 7 };
        okada.group.visible = true;
        ctx.say('"Thief! Thief! My phone!" -- an okada speeds off. Catch them!');
      }
      view();
    },

    cancel() { if (job) end('Job dropped.'); },

    /** E: get in or out of the danfo. Returns true if it handled the key. */
    act(): boolean {
      if (job?.type !== 'danfo') return false;
      const p = ctx.pos();
      if (!drive.on && drive.pos.distanceTo(p) < 5) {
        drive.on = true;
        const s0 = job.stops![0];
        ctx.waypoint(s0.x, s0.z, `Bus stop: ${s0.name}`, 'Pick up passengers.');
        ctx.say('You take the wheel. Oya, move!');
        view();
        return true;
      }
      if (drive.on && drive.speed < 1) { finish(0, job.passengers ?? 0); return true; }
      return false;
    },
    hint(): string | null {
      if (job?.type === 'danfo' && !drive.on && drive.pos.distanceTo(ctx.pos()) < 5) return 'E TO DRIVE THE DANFO';
      if (drive.on) return drive.speed < 1 ? 'E TO END THE RUN' : null;
      return null;
    },

    update(dt: number, now: number) {
      if (pending) {
        if (ctx.router.stops.length >= 3) this.start(pending.type);
        else if (now > pending.until) { pending = null; ctx.say('No jobs here right now -- try again on the street.'); }
      }
      if (!job) return;
      const p = ctx.pos();
      if (job.type === 'delivery') {
        const left = job.limit! - (now - job.started) / 1000;
        if (left < -10) { end('Too late -- the customer gave up.'); return; }
        if (!job.carrying && Math.hypot(job.pickup!.x - p.x, job.pickup!.y - p.z) < 14) {
          job.carrying = true;
          ctx.waypoint(job.drop!.x, job.drop!.y, `Deliver: ${job.dropName}`, 'The customer is waiting.');
          ctx.say(`Parcel collected. Now to ${job.dropName}!`);
        } else if (job.carrying && Math.hypot(job.drop!.x - p.x, job.drop!.y - p.z) < 14) {
          finish(job.dist!, 0);
          return;
        }
      } else if (job.type === 'danfo') {
        if (drive.on) {
          // drive: throttle and brake, steering that tightens at speed, the walls stop you
          const k = ctx.keys(), st = ctx.stick();
          const throttle = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - st.y;
          const steer = (k.has('a') || k.has('arrowleft') ? 1 : 0) - (k.has('d') || k.has('arrowright') ? 1 : 0) - st.x;
          drive.speed += throttle * (throttle * drive.speed < 0 ? 12 : 5) * dt;
          drive.speed *= Math.pow(0.6, dt); // drag
          drive.speed = Math.max(-4, Math.min(16, drive.speed));
          drive.yaw += steer * Math.min(1, Math.abs(drive.speed) / 4) * Math.sign(drive.speed || 1) * 1.1 * dt;
          const before = drive.pos.clone();
          drive.pos.x += Math.sin(drive.yaw) * drive.speed * dt;
          drive.pos.z += Math.cos(drive.yaw) * drive.speed * dt;
          ctx.city.collide(drive.pos, 1.3);
          if (drive.pos.distanceTo(before) < Math.abs(drive.speed * dt) * 0.5) drive.speed *= 0.3; // hit a wall
          bus.group.position.copy(drive.pos);
          bus.group.rotation.y = drive.yaw - Math.PI / 2;
          // a stop: pull up within 10 m and stand still a moment -- passengers board
          const stop = job.stops![job.next!];
          if (stop) {
            const d = Math.hypot(stop.x - drive.pos.x, stop.z - drive.pos.z);
            if (d < 12 && Math.abs(drive.speed) < 1.5) {
              job.still! += dt;
              if (job.still! > 1.5) {
                const n = 1 + Math.floor(Math.random() * 4);
                job.passengers! += n; job.next!++; job.still = 0;
                ctx.say(`${stop.name}: ${n} passenger${n > 1 ? 's' : ''} on. "${['Oshodi! Oshodi!', 'Enter with your change o!', 'Shift for the madam!', 'Last stop, wole!'][Math.floor(Math.random() * 4)]}"`);
                const nx = job.stops![job.next!];
                if (nx) ctx.waypoint(nx.x, nx.z, `Bus stop: ${nx.name}`, 'Pick up passengers.');
                else { ctx.say(`Route done -- ${job.passengers} passengers.`); finish(0, job.passengers!); return; }
              }
            } else job.still = 0;
          }
        }
      } else if (job.thief) {
        const t = job.thief, elapsed = (now - job.started) / 1000;
        if (elapsed > 90) { end('The thief got away into the traffic.'); return; }
        // fast at first; the old okada sputters and slows
        t.speed = elapsed < 15 ? 7.5 : elapsed < 35 ? 6 : 4.6;
        t.s = Math.min(t.path!.len, t.s + t.speed * dt);
        const a = along(t.path!, t.s);
        t.mesh.position.set(a.p.x, a.y + 0.05, a.p.y);
        t.mesh.rotation.y = Math.atan2(a.d.x, a.d.y) - Math.PI / 2;
        if (Math.hypot(a.p.x - p.x, a.p.y - p.z) < 4.5) { finish(0, 0); return; }
      }
      view();
    },
    dispose() { ctx.scene.remove(bus.group); ctx.scene.remove(okada.group); },
  };
}
