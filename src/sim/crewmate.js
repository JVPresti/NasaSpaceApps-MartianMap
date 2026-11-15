/**
 * EV2 as a crewmate (#288): what the partner astronaut decides to do each frame, as a plain state machine.
 *
 * The crewmate walks the approved route a few metres behind the player, waits when they stop, takes position beside
 * them at a science stop and sets the tool case down, closes in during a dust storm, leads the way to the shelter in a
 * radiation alert, turns for home when its own margin runs low, and follows the player up the airlock steps and into
 * the cabin at the end. It also says short radio lines (callouts) about what it does, rate limited.
 *
 * How it walks, so it never goes back and forth:
 * - Pure pursuit. It steers at a point LOOKAHEAD_M ahead of its own place on the route (or on the player's trail when
 *   they leave the route), never at the player's live position, so a player turning round does not turn it round.
 * - It walks along its own heading, and the heading turns at most TURN_DEG_S. A target behind it makes it slow down
 *   and turn on the spot first; it never steps backwards.
 * - Hysteresis on every decision. It starts following once the player is more than START_M away and stops once a
 *   stopped player is closer than STOP_M; between the two it keeps doing what it did. A walking player that close only
 *   slows it. A decision holds FLIP_SEC at least. Gaps are measured along the route, so a corner does not stop it.
 * - Waiting is still: it eases to a stop WAIT_M from a stopped player and turns to face them.
 *
 * Inputs, all plain data:
 * - `world`, the partner source's world (docs/PARTNER.md): the player, the habitat pose, and two optional queries the
 *   engine adds: `collide(x0, z0, p)` moves p out of rocks, the habitat walls and the player (src/engine/collide.js),
 *   and `zone(x, z)` names the habitat walk zone at a point.
 * - `sense`, what the crewmate knows from the mission store (src/state/crewmate.js builds it): crew size, EVA phase,
 *   route path, science stops on the route, active alerts, the shelter the re-planner chose, EV2's own suit readout
 *   and the radio link.
 *
 * Output: a PartnerState for the engine, and the callouts said this frame.
 *
 * Plain JavaScript: no React, no three.js and no store. Coordinates: x east, z south, metres from Cheyava Falls. Yaw as
 * in the PartnerState contract: 0 faces +z, atan2(dx, dz) faces a point. Habitat space as in collide.js: x toward the
 * airlock end, v sideways.
 */
import { BEND_HOLD_SEC, CASE_CLIP, HANDOVER_M, HANDOVER_REACH_M } from '../engine/partnerSource.js';

/** Every distance, speed and time the crewmate uses. Our choices (SIM), set for the 1.0 m/s walk of the player. */
export const CREWMATE = Object.freeze({
  FOLLOW_M: 7,          // the gap it keeps behind a walking player
  START_M: 10,          // a waiting crewmate starts following once the player is farther than this ...
  STOP_M: 6,            // ... and a following one stops once they are closer than this
  WAIT_M: 5,            // a stopped player: ease in toward this gap, so it stops 4 to 6 m away
  FLIP_SEC: 2,          // every decision (wait or follow, the way along the route, route or trail, lead or wait) holds this long
  LOOKAHEAD_M: 3,       // pure pursuit: steer at the point this far ahead of its own place on the route
  TURN_DEG_S: 120,      // the heading turns at most this fast
  ACCEL_MS2: 1.0,       // speeds up at most this fast ...
  DECEL_MS2: 1.2,       // ... and slows down at most this fast
  FAR_M: 10,            // leading the way: wait for the player past this ...
  LEAD_RESUME_M: 7,     // ... and lead on once they are back within this
  STORM_M: 3,           // dust storm: close in to this gap (stop under 2.5 m, start over 4.5 m)
  STORM_STOP_M: 2.5,
  STORM_START_M: 4.5,
  LEAD_M: 5,            // radiation alert: walk this far ahead of the player toward the shelter
  WALK_MS: 1.0,         // the player's walk (view.js WALK_SPEED)
  BRISK_MS: 1.5,        // catching up, the player's jog: a player who keeps jogging still pulls away
  STILL_MS: 0.2,        // the player counts as stopped below this speed ...
  STILL_SEC: 1.0,       // ... for this long
  SIDE_M: 2,            // EVA start: this far to the player's right (spawn.js PARTNER_SIDE_M)
  TELEPORT_M: 4,        // a player jump larger than this in one frame is the engine moving the crew (airlock, restart)
  OFF_ROUTE_M: 8,       // the player is farther than this from the route: follow their trail instead ...
  ON_ROUTE_M: 4,        // ... until they are back within this
  BACK_M: 4,            // the player is this far behind it along the route before it turns round
  CRUMB_M: 0.5,         // the player's trail: one point per this many metres walked ...
  CRUMBS: 400,          // ... the last this many points (200 m)
  ARRIVE_M: 0.12,       // a place to stand counts as reached within this
  SLOPE_CALL_DEG: 15,   // a slope this steep ahead gets a callout and a side step (routeProfiles.js caution grade)
  SLOPE_LOOK_M: 15,     // how far ahead along the route it looks for one
  SLOPE_SIDE_M: 1.5,    // the side step off the line on that stretch
  PASS_SIDE_M: 1.8,     // passing the player to lead the way: this far to the side, clear of the 0.9 m gap
  CALL_GAP_SEC: 20,     // at most one callout per this many seconds, unless urgent
  CALL_KEEP_SEC: 15,    // a callout that waited this long is dropped
  CHECK_AT_SEC: 15,     // the radio check, this long into the EVA
  LOW_MARGIN_SEC: 900,  // EV2's own margin under 15 min, the suit caution line: say so and turn for home
  SITE_CALL_M: 25,      // point out a science stop when the player is this close to it
  WAIT_CALL_SEC: 6,     // a player stopped this long, with the crewmate waiting 5 m or more away, gets "waiting"
  WAIT_CALL_M: 5,
  STOP_RADIUS_M: 5,     // a science stop counts within this radius (the waypoint runner's 5 m elsewhere)
  STOP_LEAVE_M: 3,      // the player has left the stop this far past its radius
  STOP_RESET_M: 25,     // a stop the crew finished is open again once the player is this far from it
  HANDOVER_TIMEOUT_SEC: 45,
  STUCK_SEC: 2,         // walking but not moving this long: step sideways (a last resort behind the avoidance below)
  AVOID_PROBE_M: 0.8,   // a rock or the player this close ahead along the heading: turn to the clearer side ...
  AVOID_HOLD_SEC: 1,    // ... and keep that side this long after the last block
});

/** The walk in and out of the habitat, in habitat space [x, v]: steps, porch, outer hatch, airlock, inner hatch, cabin. */
export const HOME_CHAIN = Object.freeze([[11.4, 0], [9.95, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.2, 1.3], [-0.3, 1.6], [-1.2, 1.0]]);
const CABIN_FROM = 7;                     // first chain point inside the cabin, past the inner hatch
const FOOT = [10.6, 0];                   // foot of the airlock steps (spawn.js AIRLOCK_EXIT_M)
const HOME_NEAR_M = 6;                    // the player this close to the foot of the steps: the crewmate heads in with them
const HOME_LEAVE_M = 8;

const hypot = Math.hypot;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A polyline with arc length: project a point on it (optionally within an arc window), read the point at an arc length. */
export function makePath(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const pts = points.filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1]));
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum[cum.length - 1];
  function at(s) {
    s = clamp(s, 0, length);
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg, a = pts[i - 1], b = pts[i];
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg };
  }
  function project(x, z, sMin = -Infinity, sMax = Infinity) {
    let best = { s: 0, d: Infinity, x: pts[0][0], z: pts[0][1] };
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < sMin || cum[i - 1] > sMax) continue;
      const ax = pts[i - 1][0], az = pts[i - 1][1], ex = pts[i][0] - ax, ez = pts[i][1] - az, l2 = ex * ex + ez * ez;
      const t = l2 > 0 ? clamp(((x - ax) * ex + (z - az) * ez) / l2, 0, 1) : 0;
      const qx = ax + ex * t, qz = az + ez * t, d = hypot(x - qx, z - qz);
      if (d < best.d) best = { s: cum[i - 1] + Math.sqrt(l2) * t, d, x: qx, z: qz };
    }
    return best.d === Infinity ? project(x, z) : best;
  }
  return { points, pts, length, at, project, start: { x: pts[0][0], z: pts[0][1] }, end: { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] } };
}

/** Minutes as the radio says them: "40 min", or "6 h 52 min" past 90 min. */
export function sayMinutes(sec) {
  const m = Math.max(0, Math.round(sec / 60));
  return m >= 90 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/**
 * The crewmate's decisions and its walk.
 * @param {{ slopeAt?: (x: number, z: number) => number, rules?: typeof CREWMATE }} [options] slopeAt: terrain slope in
 *   degrees (the engine's HiRISE query); without it the slope callout and the side step are off
 */
export function createCrewmate({ slopeAt = null, rules: R = CREWMATE } = {}) {
  const m = {
    placed: false, x: 0, z: 0, yaw: 0, speed: 0, groundSpeed: 0, walking: false,
    lastP: null, vp: 0, stillFor: 0, clock: 0, evaClock: 0, phase: null,
    carrying: true, bend: null, hold: 0, holdCarry: true, holdFace: null,   // bend: { t, carryAfter }
    path: null, pathRef: null, crumbs: [], trail: null, own: null, along: null, vAlong: 0,           // own: { ref, s } the crewmate's last place on a track
    latches: {}, flips: [],
    stopId: null, stopSpot: null, spotFor: null, done: new Map(),
    handover: null,
    chain: -1, chainArrived: false, joinX: null, homeLead: false, lowOwn: false, leftHome: false,
    slope: null, slopeCheck: 0,
    waitSaid: false, stuck: 0, sidestep: 0, avoid: null,
    lastSayAt: -Infinity, pending: [], said: new Set(), seq: 0,
    mode: 'standby', standbyFace: null,
  };

  const BUDDY_FOLLOW = { gapM: R.FOLLOW_M, stopM: R.STOP_M, startM: R.START_M, waitM: R.WAIT_M };
  const STORM_FOLLOW = { gapM: R.STORM_M, stopM: R.STORM_STOP_M, startM: R.STORM_START_M, waitM: R.STORM_M };

  // ------------------------------------------------------------ hysteresis: a decision holds FLIP_SEC at least
  const latched = (name, initial) => (m.latches[name] ??= { value: initial, at: -Infinity }).value;
  function latch(name, want, initial = want) {
    const f = m.latches[name] ??= { value: initial, at: -Infinity };
    if (want !== f.value && m.clock - f.at >= R.FLIP_SEC) { f.value = want; f.at = m.clock; m.flips.push({ name, value: want, at: m.clock }); if (m.flips.length > 200) m.flips.shift(); }
    return f.value;
  }

  // ------------------------------------------------------------ callouts
  // kind: one of the callout kinds; make() builds { key, params, sources } when it is said, or null to drop it.
  function say(kind, make, { urgent = false, once = kind } = {}) {
    if (once && m.said.has(once)) return;
    if (once) m.said.add(once);
    m.pending = m.pending.filter((p) => p.kind !== kind);
    m.pending.push({ kind, make, urgent, at: m.clock });
  }
  function flush(sense, out) {
    if (sense.link === false) return;   // no line of sight to the player: the radio does not reach them
    const keep = [];
    for (const p of m.pending) {
      if (!p.urgent && m.clock - p.at > R.CALL_KEEP_SEC) continue;
      if (!p.urgent && m.clock - m.lastSayAt < R.CALL_GAP_SEC) { keep.push(p); continue; }
      const line = p.make();
      if (!line) continue;
      m.lastSayAt = m.clock;
      out.push({ id: ++m.seq, kind: p.kind, urgent: p.urgent, atSec: finite(sense.missionSec) ? sense.missionSec : null, ...line });
    }
    m.pending = keep;
  }

  // ------------------------------------------------------------ helpers
  const local = (h, x, z) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw), dx = x - h.x, dz = z - h.z; return { x: dx * c - dz * s, v: dx * s + dz * c }; };
  const W = (h, q) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw); return { x: h.x + q[0] * c + q[1] * s, z: h.z - q[0] * s + q[1] * c }; };
  const dist = (a, b) => hypot(a.x - b.x, a.z - b.z);
  const me = () => ({ x: m.x, z: m.z });

  function place(world, sense) {
    const P = world.player, path = makePath(sense.path);
    let fx = 0, fz = -1;
    if (path) { const q = path.project(P.x, P.z), a = path.at(q.s + 10); fx = a.x - P.x; fz = a.z - P.z; }
    else if (world.habitat) { fx = P.x - world.habitat.x; fz = P.z - world.habitat.z; }
    const l = hypot(fx, fz) || 1; fx /= l; fz /= l;
    m.x = P.x - fz * R.SIDE_M; m.z = P.z + fx * R.SIDE_M;   // right of the facing direction, as in view.js
    m.yaw = Math.atan2(fx, fz); m.speed = 0;
    m.placed = true; m.chain = -1; m.homeLead = false; m.leftHome = false; m.stopId = null; m.stopSpot = null; m.handover = null; m.hold = 0;
    if (m.bend) { m.carrying = m.bend.carryAfter; m.bend = null; }
    m.carrying = true;   // the case comes along with a crew the engine moved
    m.crumbs = [[P.x, P.z]]; m.trail = null; m.own = null; m.latches = {};
    m.standbyFace = { x: m.x + fx * 10, z: m.z + fz * 10 };
  }

  function resetMission() {
    m.done.clear(); m.said.clear(); m.pending = []; m.lowOwn = false; m.slope = null; m.evaClock = 0;
    m.lastSayAt = -Infinity; m.waitSaid = false;
  }

  function startBend(carryAfter) { m.bend = { t: 0, carryAfter }; m.speed = 0; }

  // ------------------------------------------------------------ intents: hold (face a point) or go (to a point at a speed)
  const hold = (face) => ({ go: null, face });
  const go = (x, z, speed, face = null) => ({ go: { x, z }, speed, face });

  // the player's trail, for following off the route: one point per CRUMB_M walked
  function addCrumb(P) {
    const last = m.crumbs[m.crumbs.length - 1];
    if (last && hypot(P.x - last[0], P.z - last[1]) < R.CRUMB_M) return;
    m.crumbs.push([P.x, P.z]);
    let dropped = 0;
    if (m.crumbs.length > R.CRUMBS) { const a = m.crumbs.shift(), b = m.crumbs[0]; dropped = hypot(b[0] - a[0], b[1] - a[1]); }
    const old = m.trail;
    m.trail = makePath(m.crumbs);
    // a growing trail keeps its arc lengths: carry the crewmate's place over (less what fell off the front) instead of
    // searching the whole trail again, where a player walking back past it would pull its place onto their newest steps
    if (m.own && m.own.kind === 'trail' && m.own.ref === old) m.own = { ...m.own, ref: m.trail, s: Math.max(0, m.own.s - dropped) };
    if (m.along && m.along.kind === 'trail' && m.along.ref === old) m.along = { ...m.along, ref: m.trail, s: m.along.s - dropped };
  }

  // the track it follows: the route while the player walks it, the player's own trail while they are off it
  function track(P) {
    const route = m.path, off = route ? route.project(P.x, P.z).d : Infinity;
    const cur = latched('track', route ? 'route' : 'trail');
    // back to the route only once the crewmate is near it too: until then the trail leads it there, without doubling back
    const ownOff = route ? route.project(m.x, m.z).d : Infinity;
    const want = !route ? 'trail' : cur === 'route' ? (off > R.OFF_ROUTE_M ? 'trail' : 'route') : (off < R.ON_ROUTE_M && ownOff < R.ON_ROUTE_M ? 'route' : 'trail');
    const kind = !route ? 'trail' : latch('track', want);
    const tr = kind === 'route' ? route : m.trail;
    return tr ? { kind, tr } : null;
  }

  // the crewmate's own place on a track, searched near where it was, so a route that comes back on itself cannot make it jump
  function ownPlace(t) {
    const prev = m.own && m.own.kind === t.kind && m.own.ref === t.tr ? m.own.s : null;
    const q = prev === null ? t.tr.project(m.x, m.z) : t.tr.project(m.x, m.z, prev - 10, prev + 10);
    m.own = { kind: t.kind, ref: t.tr, s: q.s };
    return q;
  }

  // pure pursuit: the point LOOKAHEAD_M ahead of its own place, in direction dir, sideM off the line (left when positive)
  function pursuit(tr, sOwn, dir, sideM = 0) {
    const a = tr.at(sOwn + dir * R.LOOKAHEAD_M);
    return { x: a.x + a.tz * dir * sideM, z: a.z - a.tx * dir * sideM };
  }

  // the slope ahead along the route: a side step and one callout per steep stretch
  function checkSlope(path, sFrom, dir) {
    if (!slopeAt || m.clock < m.slopeCheck) return;
    m.slopeCheck = m.clock + 0.5;
    if (m.slope && (sFrom - m.slope.s1) * dir > 2) m.slope = null;   // past the stretch
    if (m.slope) return;
    let max = 0, s0 = null, s1 = null, left = 0, right = 0;
    for (let k = 2; k <= R.SLOPE_LOOK_M; k++) {
      const s = sFrom + dir * k; if (s < 0 || s > path.length) break;
      const a = path.at(s), sl = slopeAt(a.x, a.z);
      if (!finite(sl) || sl < R.SLOPE_CALL_DEG) continue;
      if (s0 === null) s0 = s; s1 = s; max = Math.max(max, sl);
      const lx = a.tz * dir, lz = -a.tx * dir;   // left of the walking direction
      left += slopeAt(a.x + lx * R.SLOPE_SIDE_M, a.z + lz * R.SLOPE_SIDE_M) || 0;
      right += slopeAt(a.x - lx * R.SLOPE_SIDE_M, a.z - lz * R.SLOPE_SIDE_M) || 0;
    }
    if (s0 === null) return;
    const sign = left <= right ? 1 : -1, deg = Math.round(max);
    m.slope = { s0: s0 - dir * 2, s1, sign };
    say('slope', () => ({ key: 'crewmate.say.slope', params: { deg, side: sign > 0 ? 'crewmate.side.left' : 'crewmate.side.right' }, sources: { deg: 'crewmate.slopeAheadDeg' } }),
      { once: 'slope:' + Math.round(s0) });
  }
  // the side step on the steep stretch: SLOPE_SIDE_M left (+) or right (-) of the walking direction, 0 elsewhere
  function slopeSide(sOwn) {
    const sl = m.slope;
    if (!sl) return 0;
    const lo = Math.min(sl.s0, sl.s1), hi = Math.max(sl.s0, sl.s1);
    return sOwn >= lo - 2 && sOwn <= hi + 2 ? sl.sign * R.SLOPE_SIDE_M : 0;
  }

  /**
   * Following, with hysteresis: it waits until the player is past startM, then follows until they are within stopM.
   * While following it keeps gapM behind a walking player and eases in to waitM behind a stopped one.
   */
  function follow(P, { gapM, stopM, startM, waitM }) {
    const still = m.stillFor >= R.STILL_SEC, t = track(P);
    let d = dist(me(), P), pe = null, sP = 0, dir = 1;
    if (t) {
      pe = ownPlace(t); sP = t.kind === 'trail' ? t.tr.length : t.tr.project(P.x, P.z).s;
      // which way along the track the player is: it turns round only once they are BACK_M behind it and walking away,
      // past startM. A player who walks back toward it, or past it, is waited for, not turned round for.
      const dirName = 'dir:' + t.kind, curDir = latched(dirName, sP >= pe.s ? 1 : -1);
      dir = latch(dirName, (sP - pe.s) * curDir < -R.BACK_M && dist(me(), P) > startM ? -curDir : curDir);
      // on the track, the gap is measured along it: a player rounding a corner is no closer than before
      if (pe.d < 3) d = Math.max(d, (sP - pe.s) * dir);
      // the player's progress along the track, smoothed: walking sideways off the route is no progress
      const a = m.along;
      if (a && a.ref === t.tr && a.kind === t.kind) { const dt = m.clock - a.t; if (dt > 0) m.vAlong += (((sP - a.s) * dir) / dt - m.vAlong) * Math.min(1, dt * 3); }
      else m.vAlong = t.kind === 'trail' ? m.vp : 0;
      m.along = { ref: t.tr, kind: t.kind, s: sP, t: m.clock };
    }
    const cur = latched('follow', 'wait');
    // it stops under stopM once the player has stopped; a walking player that close (a corner, a slow step) only slows it,
    // unless they come right up to it
    const stopNow = d < stopM && (still || d < stopM * 0.6);
    const state = latch('follow', cur === 'follow' ? (stopNow ? 'wait' : 'follow') : (d > startM ? 'follow' : 'wait'));
    if (state === 'wait' || !t) return hold(P);
    if (t.kind === 'route') checkSlope(t.tr, pe.s, dir);
    // speed from the gap along the track and the player's progress along it, so it never walks past their place
    const gapAlong = (sP - pe.s) * dir, far = Math.max(d, gapAlong);
    if (gapAlong < 0.5) return hold(P);   // level with the player's place or ahead of it: stand and let them lead
    const speed = still
      ? clamp(0.6 * (Math.min(far, gapAlong + 1) - waitM), 0, far > R.START_M ? R.BRISK_MS : R.WALK_MS)
      : clamp(Math.max(0, m.vAlong) + 0.6 * (gapAlong - gapM), 0, R.BRISK_MS);
    const aim = pursuit(t.tr, pe.s, dir, t.kind === 'route' ? slopeSide(pe.s) : 0);
    return go(aim.x, aim.z, speed, P);
  }

  // lead the way to a target (the shelter, or home), leadM ahead of the player; it waits for them past FAR_M
  function lead(P, target, leadM) {
    const d = dist(me(), P), path = m.path;
    const dEnd = path ? dist(path.end, target) : Infinity, dStart = path ? dist(path.start, target) : Infinity;
    if (path && Math.min(dEnd, dStart) < 40 && path.project(P.x, P.z).d <= R.OFF_ROUTE_M) {
      const dir = dEnd <= dStart ? 1 : -1, t = { kind: 'route', tr: path }, pp = path.project(P.x, P.z);
      if ((dir > 0 ? path.length - pp.s : pp.s) < 10) return null;   // nearly there: fall in behind and go in after them
      const pe = ownPlace(t);
      const rel = (pe.s - pp.s) * dir;                     // how far ahead of the player along the route
      const cur = latched('lead', 'lead');
      if (latch('lead', cur === 'lead' ? (rel > 0 && d > R.FAR_M ? 'wait' : 'lead') : (d < R.LEAD_RESUME_M || rel <= 0 ? 'lead' : 'wait')) === 'wait') return hold(P);
      checkSlope(path, pe.s, dir);
      const passing = rel < leadM - 1;                     // beside or behind: pass on the left at a brisk walk
      const speed = passing ? R.BRISK_MS : clamp(m.vp + 0.6 * (leadM - rel), 0, R.BRISK_MS);
      const aim = pursuit(path, pe.s, dir, passing ? R.PASS_SIDE_M : slopeSide(pe.s));
      return go(aim.x, aim.z, speed, P);
    }
    // no route that ends there: toward the target, leadM ahead of the player
    const tx = target.x - P.x, tz = target.z - P.z, l = hypot(tx, tz) || 1, k = Math.min(leadM, l);
    const gx = P.x + tx / l * k, gz = P.z + tz / l * k;
    const cur = latched('lead', 'lead'), ahead = dist(me(), target) < dist(P, target);
    if (latch('lead', cur === 'lead' ? (ahead && d > R.FAR_M ? 'wait' : 'lead') : (d < R.LEAD_RESUME_M || !ahead ? 'lead' : 'wait')) === 'wait') return hold(P);
    return go(gx, gz, R.BRISK_MS, P);
  }

  // the walk in and out of the habitat behind the player: up the steps and into the cabin, or back out, never passing them
  function home(world, P, leading) {
    const h = world.habitat, pl = local(h, P.x, P.z), zone = world.zone ? world.zone(P.x, P.z) : null;
    const foot = W(h, FOOT);
    if (m.chain < 0) {
      // leading the way home (radiation, low margin): go up first. Otherwise wait behind as on the walk, and climb
      // after the player once they are on the steps. No side step: it would walk away and come back.
      const ahead = leading && dist(me(), foot) + 1 < dist(P, foot) && dist(me(), foot) < HOME_NEAR_M;
      const climbing = !!zone && pl.x < HOME_CHAIN[0][0] - 1.5;
      if (!ahead && !climbing) return null;
      // join the walk without walking back out: from outside, onto the steps' centre line at the foot, a little inward of
      // where it stands (the steps have side walls, so the front is the only way on); from inside, the next point inward
      const ownL = local(h, m.x, m.z), inside = !!(world.zone && world.zone(m.x, m.z));
      const entry = !inside ? 0 : HOME_CHAIN.findIndex((q) => q[0] < ownL.x - 0.3);
      m.joinX = entry === 0 ? clamp(ownL.x - Math.abs(ownL.v) * 0.8, HOME_CHAIN[1][0] + 0.3, HOME_CHAIN[0][0]) : null;   // on a diagonal, not a right angle
      m.chain = entry < 0 || entry >= CABIN_FROM ? 0 : entry; m.homeLead = ahead; m.chainArrived = false;
    }
    // the chain point it should be at: 1.5 m behind the player in habitat x, on the side it came from
    const point = (i) => (i === 0 && m.joinX !== null ? [m.joinX, 0] : HOME_CHAIN[i]);
    const LAST = HOME_CHAIN.length - 1, ownX = point(m.chain)[0];
    let want = m.chain;
    if (m.homeLead && zone && pl.x < ownX) m.homeLead = false;   // the player is further in: trail them from here on
    if (m.homeLead) {        // in first: on into the cabin while the player keeps within 8 m, back out if they walk off
      if (!zone && dist(P, foot) > HOME_LEAVE_M) { m.homeLead = false; want = 0; }
      else want = dist(me(), P) < 8 ? LAST : m.chain;
    } else if (zone === 'main') {   // in the cabin: follow in once the player is clear of the inner hatch, else wait in the airlock
      const door = HOME_CHAIN[CABIN_FROM - 1], clear = hypot(pl.x - door[0], pl.v - door[1]) > 1.4;
      want = clear || m.chain >= CABIN_FROM ? LAST : CABIN_FROM - 2;
    } else if (!zone) want = 0;
    else if (m.chain >= CABIN_FROM || pl.x > ownX) {   // the player is on the way out: trail on the inside
      let s = -1;
      for (let i = 0; i < CABIN_FROM; i++) if (HOME_CHAIN[i][0] <= pl.x - 1.5) { s = i; break; }
      want = s >= 0 ? Math.min(m.chain, s) : m.chain;
    } else {                                         // the player is on the way in: trail on the outside
      let s = -1;
      for (let i = 0; i < CABIN_FROM; i++) if (HOME_CHAIN[i][0] >= pl.x + 1.5) s = i;
      want = Math.max(m.chain, s);
    }
    const here = W(h, point(m.chain));
    if (!m.chainArrived && hypot(here.x - m.x, here.z - m.z) >= 0.15 && want < m.chain) {
      // not on the walk yet and the player is not far enough ahead: wait where it stands (or rejoin the walk outside)
      if (!zone) { m.chain = -1; m.homeLead = false; return null; }
      return hold(P);
    }
    if (hypot(here.x - m.x, here.z - m.z) < 0.15) {
      m.chainArrived = true;
      if (want > m.chain) m.chain++;
      else if (want < m.chain) m.chain--;
      else if (m.chain === 0 && !zone && !m.homeLead) { m.chain = -1; return hold(P); }   // out again: back to the walk
      else return hold(P);
    }
    const next = W(h, point(m.chain));
    return go(next.x, next.z, R.WALK_MS * 0.8, P);
  }

  // ------------------------------------------------------------ one frame
  function decide(dt, world, sense) {
    const P = world.player, h = world.habitat;
    if (m.hold > 0) { m.hold -= dt; if (m.hold <= 0) { m.hold = 0; startBend(m.holdCarry); } return hold(m.holdFace); }

    if (sense.phase === 'pre') { m.mode = 'standby'; return hold(m.standbyFace ?? P); }

    // home: the player at the foot of the steps or in the habitat, or the crewmate already on the way in
    const zone = h && world.zone ? world.zone(P.x, P.z) : null;
    if (h && dist(P, W(h, FOOT)) > 15) m.leftHome = true;
    if (h && (zone || m.chain >= 0 || (m.leftHome && dist(P, W(h, FOOT)) < HOME_NEAR_M)) && m.carrying) {
      const intent = home(world, P, sense.radiation || m.lowOwn);
      if (intent) { m.mode = 'home'; return intent; }
    }

    // the case is down: the crewmate stays with it, and picks it up when the player leaves or an event starts
    if (!m.carrying) {
      m.mode = 'case';
      const stop = m.stopId && sense.stops.find((s) => s.id === m.stopId);
      const away = stop ? dist(P, stop) > stop.radiusM + R.STOP_LEAVE_M : dist(P, me()) > 6;
      if (away || sense.storm || sense.radiation || m.lowOwn || sense.phase === 'post') { if (stop) m.done.set(stop.id, true); startBend(true); }
      return hold(P);
    }

    const target = sense.shelter && finite(sense.shelter.x) ? sense.shelter : (h ? W(h, FOOT) : null);
    if (sense.radiation && target) {
      m.mode = 'radiation';
      say('radiation', () => ({ key: 'crewmate.say.radiation', params: { shelter: sense.shelter && sense.shelter.type !== 'habitat' && sense.shelter.name ? sense.shelter.name : 'crewmate.habitat' }, sources: {} }), { urgent: true });
      return lead(P, target, sense.storm ? R.STORM_M : R.LEAD_M) ?? follow(P, sense.storm ? STORM_FOLLOW : BUDDY_FOLLOW);
    }
    // low margin: turn for home, up to just short of FAR_M ahead, then wait for the player there
    if (m.lowOwn && h) { m.mode = 'low'; return lead(P, W(h, FOOT), R.FAR_M - 1) ?? follow(P, BUDDY_FOLLOW); }
    if (sense.storm) {
      m.mode = 'storm';
      say('storm', () => ({ key: 'crewmate.say.storm', params: {}, sources: {} }), { urgent: true });
      return follow(P, STORM_FOLLOW);
    }

    // bringing the case to the player (F, the sampling hand-over)
    if (m.handover) {
      m.mode = 'handover';
      m.handover.t += dt;
      const d = dist(me(), P);
      if (m.handover.t > R.HANDOVER_TIMEOUT_SEC) m.handover = null;
      else if (d <= Math.max(HANDOVER_REACH_M, HANDOVER_M + 2 * R.ARRIVE_M)) { m.handover = null; m.hold = BEND_HOLD_SEC; m.holdCarry = false; m.holdFace = { x: P.x, z: P.z }; return hold(P); }
      else { const k = HANDOVER_M / d; return go(P.x + (m.x - P.x) * k, P.z + (m.z - P.z) * k, d > R.FAR_M ? R.BRISK_MS : R.WALK_MS, P); }
    }

    // science stop: beside the player, case down
    for (const [id] of m.done) { const s = sense.stops.find((q) => q.id === id); if (!s || dist(P, s) > R.STOP_RESET_M) m.done.delete(id); }
    let stop = m.stopId ? sense.stops.find((s) => s.id === m.stopId) : null;
    if (stop && dist(P, stop) > stop.radiusM + R.STOP_LEAVE_M) { m.stopId = null; stop = null; m.stopSpot = null; }
    if (!stop) {
      stop = sense.stops.find((s) => !m.done.has(s.id) && dist(P, s) <= s.radiusM && (m.stillFor >= R.STILL_SEC || dist(P, s) <= 2.5)) ?? null;
      if (stop) { m.stopId = stop.id; m.stopSpot = null; }
    }
    if (stop && !m.done.has(stop.id)) {
      m.mode = 'stop';
      if (!m.stopSpot || dist(P, m.spotFor) > 1.2) {
        let ax = stop.x - P.x, az = stop.z - P.z, l = hypot(ax, az);
        if (l < 0.6) { ax = P.x - m.x; az = P.z - m.z; l = hypot(ax, az) || 1; }
        const px = -az / l, pz = ax / l;
        const a = { x: P.x + px * HANDOVER_M, z: P.z + pz * HANDOVER_M }, b = { x: P.x - px * HANDOVER_M, z: P.z - pz * HANDOVER_M };
        m.stopSpot = dist(a, me()) <= dist(b, me()) ? a : b; m.spotFor = { x: P.x, z: P.z };
      }
      const s = m.stopSpot, ds = hypot(s.x - m.x, s.z - m.z);
      if (ds > R.ARRIVE_M * 2 && dist(me(), P) > HANDOVER_REACH_M - 0.1) return go(s.x, s.z, ds > R.FAR_M ? R.BRISK_MS : R.WALK_MS, P);
      if (m.speed < 0.05 && (m.stillFor >= 0.5 || dist(me(), P) <= HANDOVER_REACH_M)) {
        m.hold = BEND_HOLD_SEC; m.holdCarry = false; m.holdFace = { x: P.x, z: P.z };
        say('case', () => ({ key: 'crewmate.say.case', params: {}, sources: {} }), { once: 'case:' + stop.id });
      }
      return hold(P);
    }

    m.mode = 'buddy';
    const intent = follow(P, BUDDY_FOLLOW);
    // the player stopped and the crewmate waits: say so, once per stop
    if (!intent.go && m.stillFor >= R.WAIT_CALL_SEC && dist(me(), P) >= R.WAIT_CALL_M && !m.waitSaid) {
      m.waitSaid = true;
      const range = finite(sense.rangeM) ? sense.rangeM : dist(me(), P);
      say('wait', () => ({ key: 'crewmate.say.wait', params: { range: Math.round(range) }, sources: { range: 'crew.0.rangeM' } }), { once: null });
    }
    if (m.stillFor === 0) m.waitSaid = false;
    return intent;
  }

  function update(dt, world, sense = {}) {
    const out = [];
    const P = world && world.player;
    sense = { stops: [], ...sense };
    if (!P || sense.present === false) { m.placed = false; m.lastP = null; return { state: { visible: false, x: m.x, z: m.z, yaw: m.yaw, gait: 'idle', speedMs: 0, action: null, carrying: true, lampOn: undefined }, said: out }; }

    // the engine moved the crew (the airlock, a restart): stand beside the player again
    const jumped = m.lastP && hypot(P.x - m.lastP.x, P.z - m.lastP.z) > R.TELEPORT_M;
    if (!m.placed || jumped || (sense.phase === 'pre' && dist(P, me()) > 25)) {
      place(world, sense);
      m.lastP = { x: P.x, z: P.z }; m.vp = 0; m.stillFor = 0;
    }
    if (sense.phase !== m.phase) { if (sense.phase === 'eva' || sense.phase === 'pre') resetMission(); m.phase = sense.phase; }
    if (sense.path !== m.pathRef) { m.pathRef = sense.path; m.path = makePath(sense.path); m.slope = null; if (m.own && m.own.kind === 'route') m.own = null; delete m.latches['dir:route']; }

    const step = m.lastP && dt > 0 ? hypot(P.x - m.lastP.x, P.z - m.lastP.z) : 0;
    m.lastP = { x: P.x, z: P.z };
    if (sense.paused || !(dt > 0)) return { state: pose(false), said: out };

    m.clock += dt;
    if (sense.phase === 'eva') m.evaClock += dt;
    m.vp += (step / dt - m.vp) * Math.min(1, dt * 3);
    m.stillFor = m.vp < R.STILL_MS ? m.stillFor + dt : 0;
    addCrumb(P);

    // EV2's own suit: a low margin latches until the next EVA
    const own = sense.own;
    if (!m.lowOwn && own && finite(own.marginSec) && own.marginSec < R.LOW_MARGIN_SEC && sense.phase === 'eva') {
      m.lowOwn = true;
      say('low', () => ({ key: 'crewmate.say.low', params: { margin: sayMinutes(sense.own?.marginSec ?? own.marginSec) }, sources: { margin: 'crew.0.marginSec' } }), { urgent: true });
    }
    if (sense.phase === 'eva' && m.evaClock >= R.CHECK_AT_SEC && own && finite(own.marginSec)) {
      say('check', () => (finite(sense.own?.marginSec) ? { key: 'crewmate.say.check', params: { margin: sayMinutes(sense.own.marginSec) }, sources: { margin: 'crew.0.marginSec' } } : null));
    }
    const next = sense.nextStop;
    if (sense.phase === 'eva' && next && finite(next.rangeM) && next.rangeM <= R.SITE_CALL_M && !sense.storm && !sense.radiation) {
      say('site', () => (finite(sense.nextStop?.rangeM) ? { key: 'crewmate.say.site', params: { site: next.name, range: Math.round(sense.nextStop.rangeM) }, sources: { range: 'navigation.waypointRangeM' } } : null),
        { once: 'site:' + next.name });
    }

    // the case clip: release or grab at 0.9 s, done at 2.07 s
    let intent;
    if (m.bend) {
      m.bend.t += dt;
      if (m.bend.t >= CASE_CLIP.releaseAt && m.carrying !== m.bend.carryAfter) m.carrying = m.bend.carryAfter;
      if (m.bend.t >= CASE_CLIP.seconds) m.bend = null;
      intent = hold(null);
    } else intent = decide(dt, world, sense);

    move(dt, world, intent);
    flush(sense, out);
    return { state: pose(true), said: out };
  }

  // Walk along the heading. The heading turns toward the aim at most TURN_DEG_S; the speed follows the intent within
  // ACCEL_MS2 and DECEL_MS2, drops to nothing for an aim more than 90 degrees off the heading (turn first), and eases
  // off near a place to stand. A hold decelerates, then turns to face its point.
  // how far a step of lenM along yaw gets after the collisions, as a share of lenM (1: free, 0: blocked)
  function progress(world, yaw, lenM) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), p = { x: m.x + fx * lenM, z: m.z + fz * lenM };
    world.collide(m.x, m.z, p);
    return ((p.x - m.x) * fx + (p.z - m.z) * fz) / lenM;
  }

  function move(dt, world, intent) {
    const maxTurn = R.TURN_DEG_S * Math.PI / 180 * dt;
    let aimYaw = null, vWant = 0;
    if (intent.go && !m.bend) {
      const gx = intent.go.x - m.x, gz = intent.go.z - m.z, gd = hypot(gx, gz);
      if (gd > R.ARRIVE_M) {
        aimYaw = Math.atan2(gx, gz);
        // A rock (or the player) in the way: probe AVOID_PROBE_M ahead along the heading and, when that is blocked,
        // turn to the clearer side. The side holds AVOID_HOLD_SEC after the last block, so it does not dither. Not on
        // the walk into the habitat, whose walls the slide handles.
        if (world.collide && m.mode !== 'home' && intent.speed > 0.2 && gd > R.AVOID_PROBE_M) {
          if (progress(world, m.yaw, R.AVOID_PROBE_M) < 0.7) {
            const keep = m.avoid && m.clock - m.avoid.at < R.AVOID_HOLD_SEC;
            const left = progress(world, m.yaw + 0.7, R.AVOID_PROBE_M), right = progress(world, m.yaw - 0.7, R.AVOID_PROBE_M);
            const sign = keep ? m.avoid.sign : left === right ? (wrap(aimYaw - m.yaw) >= 0 ? 1 : -1) : left > right ? 1 : -1;
            m.avoid = { sign, at: m.clock };
          }
          if (m.avoid && m.clock - m.avoid.at < R.AVOID_HOLD_SEC / 2) aimYaw = m.yaw + m.avoid.sign * 1.2;
        }
        if (m.sidestep > 0) { m.sidestep -= dt; aimYaw += 1.2; }
        const off = wrap(aimYaw - m.yaw);
        vWant = Math.min(intent.speed, gd * 1.2) * Math.max(0, Math.cos(off));
      }
    }
    if (aimYaw === null && intent.face && m.speed < 0.2 && !m.bend) aimYaw = Math.atan2(intent.face.x - m.x, intent.face.z - m.z);
    const a = vWant > m.speed ? R.ACCEL_MS2 : R.DECEL_MS2;
    m.speed += clamp(vWant - m.speed, -a * dt, a * dt);
    if (aimYaw !== null && !m.bend) {
      const off = wrap(aimYaw - m.yaw);
      m.yaw = wrap(m.yaw + clamp(off * Math.min(1, dt * 5), -maxTurn, maxTurn));
    }
    m.groundSpeed = 0;
    if (m.speed > 0.01 && !m.bend) {
      const st = m.speed * dt, p = { x: m.x + Math.sin(m.yaw) * st, z: m.z + Math.cos(m.yaw) * st };
      if (world.collide) world.collide(m.x, m.z, p);
      const moved = hypot(p.x - m.x, p.z - m.z);
      m.stuck = vWant > 0.2 && moved < st * 0.2 ? m.stuck + dt : 0;
      if (m.stuck > R.STUCK_SEC) { m.stuck = 0; m.sidestep = 1.2; }
      m.x = p.x; m.z = p.z;
      m.groundSpeed = moved / dt;
    } else m.speed = Math.max(0, m.speed);
    m.walking = m.groundSpeed > 0.05;
  }

  function pose(live) {
    const walking = live && m.walking;
    return {
      visible: true, x: m.x, z: m.z, yaw: m.yaw,
      gait: walking ? 'walk' : 'idle',
      speedMs: walking ? m.groundSpeed : 0,
      action: m.bend ? { name: CASE_CLIP.name, timeSec: m.bend.t, carryingAfter: m.bend.carryAfter } : null,
      carrying: m.carrying,
      lampOn: undefined,
    };
  }

  /**
   * 'toggleCase', the sampling hand-over (src/engine/sampling.js): with the case in hand, bring it to the player and
   * set it down; with the case down, pick it up. Returns false while the case clip plays, and refuses to set the case
   * down during an event or on the way home.
   */
  function command(name, world, sense = {}) {
    if (name !== 'toggleCase' || m.bend || m.hold > 0) return false;
    if (!m.carrying) {
      startBend(true);
      if (m.stopId) m.done.set(m.stopId, true);   // the sample is in: this stop is finished
      return true;
    }
    if (sense.storm || sense.radiation || m.lowOwn || m.chain >= 0 || sense.phase !== 'eva') return false;
    m.handover = { t: 0 };
    return true;
  }

  return {
    update, command,
    /** What the crewmate is doing, for tests and the development hook. flips: every latched decision change, with its time. */
    inspect: () => ({ mode: m.mode, x: m.x, z: m.z, yaw: m.yaw, carrying: m.carrying, bending: !!m.bend, chain: m.chain, lowOwn: m.lowOwn, stopId: m.stopId, done: [...m.done.keys()], follow: latched('follow', 'wait'), flips: m.flips.slice() }),
  };
}

/**
 * The crewmate as a partner source (docs/PARTNER.md), the app's default EV2.
 * @param {{ id?: string, color?: number[], sense: () => object, slopeAt?: Function, onCallout?: (callout: object) => void,
 *   rules?: typeof CREWMATE }} options sense() returns the store's view for this frame (src/state/crewmate.js)
 */
export function createCrewmatePartner({ id = 'EV2', color = [1, 0.32, 0.03], sense, slopeAt = null, onCallout = () => {}, rules } = {}) {
  const brain = createCrewmate({ slopeAt, rules });
  const read = () => (typeof sense === 'function' ? sense() || {} : {});
  return {
    id, color, kind: 'crewmate',
    update(dt, world) {
      const { state, said } = brain.update(dt, world, read());
      for (const c of said) onCallout(c);
      return state;
    },
    command: (name, world) => brain.command(name, world, read()),
    inspect: brain.inspect,
  };
}
