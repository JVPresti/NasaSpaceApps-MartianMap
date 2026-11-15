/**
 * Test fixtures for the crewmate (src/sim/crewmate.js, #288): a partner-source world with the real walker collisions
 * of src/engine/collide.js, a habitat placed like the engine places it, and a scripted player track.
 * Used by the crewmate tests only.
 */
import { addCircle, habCanStand, habSlideWorld, habZone, PARTNER_GAP, pushOut, WALKER_RADIUS } from '../engine/collide.js';

/** The mission table: habitat_furniture layout.json planning_table, 0.7 m collision circle at the origin. */
export const TABLE = [{ x: 0, v: 0, radius: 0.7 }];
/** The habitat entry of public/data/shelters.json: the foot of the airlock steps, habitat x 9.9. */
export const HAB_ENTRY = { x: 535.1, z: 574.1 };
/** The first sortie stop of #282 (stops.json route_stops "S1 · light-toned patch"), 55 m from the airlock. */
export const S1 = { id: 'sortie', name: 'Light-toned patch by the habitat', waypoint: 'S1 · light-toned patch', x: 493, z: 539 };

/** Habitat pose { x, z, yaw } with its airlock end toward `out`, the steps' foot (x 9.9) at `entry`. */
export function makeHabitat(entry = HAB_ENTRY, out = S1) {
  // the airlock points away from the cabin; put the cabin on the far side of the entry from the stop, at an angle
  const dx = out.x - entry.x, dz = out.z - entry.z, l = Math.hypot(dx, dz);
  const ux = (dx / l) * Math.cos(0.6) - (dz / l) * Math.sin(0.6), uz = (dx / l) * Math.sin(0.6) + (dz / l) * Math.cos(0.6);
  return { x: entry.x - ux * 9.9, z: entry.z - uz * 9.9, yaw: Math.atan2(-uz, ux) };
}

/** Habitat space to world: x toward the airlock end, v sideways (collide.js). */
export function habToWorld(h, x, v) {
  const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
  return { x: h.x + x * c + v * s, z: h.z - x * s + v * c };
}
export function worldToHab(h, x, z) {
  const c = Math.cos(h.yaw), s = Math.sin(h.yaw), dx = x - h.x, dz = z - h.z;
  return { x: dx * c - dz * s, v: dx * s + dz * c };
}

/** True when a walker may stand at the world point (inside a walk zone or outside every habitat solid). */
export function canStand(h, x, z) {
  const l = worldToHab(h, x, z);
  return habCanStand(l.x, l.v, 1, TABLE);
}

/**
 * A partner-source world: the player, the habitat and the two optional queries the engine adds (partner.js).
 * @param {{ habitat?: { x: number, z: number, yaw: number } | null, rocks?: Array<{ x: number, z: number, r: number }> }} [options]
 */
export function makeWorld({ habitat = null, rocks = [] } = {}) {
  const obs = [];
  const world = {
    player: { x: 0, z: 0 },
    habitat,
    duck: () => 0,
    zone(x, z) {
      if (!habitat) return null;
      const l = worldToHab(habitat, x, z), q = habZone(l.x, l.v, 1, TABLE);
      return q ? q.n : null;
    },
    collide(x0, z0, p) {
      obs.length = 0;
      for (const r of rocks) addCircle(obs, r.x, r.z, r.r);
      addCircle(obs, world.player.x, world.player.z, PARTNER_GAP - WALKER_RADIUS);
      pushOut(p, obs, WALKER_RADIUS);
      if (habitat) habSlideWorld(habitat.x, habitat.z, habitat.yaw, 1, TABLE, x0, z0, p);
      return p;
    },
  };
  return world;
}

/**
 * A player track from legs: { to: { x, z }, speed } walks there in a straight line, { waitSec } stands still.
 * Returns position(t) for t in seconds from the start, and the time the track ends.
 */
export function makeTrack(start, legs) {
  const keys = [{ t: 0, x: start.x, z: start.z }];
  let t = 0, x = start.x, z = start.z;
  for (const leg of legs) {
    if (leg.waitSec !== undefined) { t += leg.waitSec; keys.push({ t, x, z }); continue; }
    const d = Math.hypot(leg.to.x - x, leg.to.z - z);
    t += d / leg.speed; x = leg.to.x; z = leg.to.z; keys.push({ t, x, z });
  }
  return {
    endSec: t,
    at(time) {
      if (time >= t) return { x, z };
      let i = 1; while (keys[i].t < time) i++;
      const a = keys[i - 1], b = keys[i], k = b.t > a.t ? (time - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
    },
  };
}

/** A path [[x, z], ...] through points, one vertex every `step` metres, as the planner writes route.path. */
export function densePath(points, step = 2) {
  const out = [[points[0].x, points[0].z]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n]);
  }
  return out;
}

/**
 * Direction reversals in a walk: moments when the walking direction differs by more than `deg` from the last walking
 * direction at least `windowSec` earlier. A pause in between does not hide one: walking one way, stopping and walking
 * back within `pauseSec` counts. Each reversal counts once, until the direction settles (under half the angle against
 * the direction windowSec before). `frames` are { t, x, z } at a fixed step.
 * @returns {number[]} the times of the reversals
 */
export function reversals(frames, { deg = 90, windowSec = 2, pauseSec = 8, minSpeed = 0.2, stepSec = 0.25 } = {}) {
  if (frames.length < 3) return [];
  const dt = frames[1].t - frames[0].t, k = Math.max(1, Math.round(stepSec / dt));
  const heads = [];   // walking direction over each stepSec, while walking
  for (let i = k; i < frames.length; i += k) {
    const a = frames[i - k], b = frames[i], dx = b.x - a.x, dz = b.z - a.z, v = Math.hypot(dx, dz) / (b.t - a.t);
    if (v >= minSpeed) heads.push({ t: b.t, h: Math.atan2(dx, dz) });
  }
  const out = [];
  let armed = true, j = 0;
  for (let i = 0; i < heads.length; i++) {
    while (j + 1 < i && heads[j + 1].t <= heads[i].t - windowSec) j++;   // the last walking sample windowSec or more before
    const ref = heads[j];
    if (!ref || ref.t > heads[i].t - windowSec || heads[i].t - ref.t > windowSec + pauseSec) continue;
    const turn = Math.abs(Math.atan2(Math.sin(heads[i].h - ref.h), Math.cos(heads[i].h - ref.h))) * 180 / Math.PI;
    if (armed && turn > deg) { out.push(heads[i].t); armed = false; }
    else if (!armed && turn < deg / 2) armed = true;
  }
  return out;
}

/**
 * Heading jitter: how often the turn changes direction. The yaw rate is taken over stepSec windows, and only turns
 * faster than minDegS count, so the slow turn to keep facing a swaying player does not. A turn left followed by a
 * turn right is one flip. Independent of the frame rate.
 */
export function yawFlips(frames, { minDegS = 30, stepSec = 0.1 } = {}) {
  if (frames.length < 3) return 0;
  const dt = frames[1].t - frames[0].t, k = Math.max(1, Math.round(stepSec / dt));
  let flips = 0, last = 0;
  for (let i = k; i < frames.length; i += k) {
    const a = frames[i - k], b = frames[i], d = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    if (Math.abs(d) * 180 / Math.PI / (b.t - a.t) < minDegS) continue;
    if (last && Math.sign(d) !== last) flips++;
    last = Math.sign(d);
  }
  return flips;
}

/**
 * The track without EV2's steps aside out of the player's way (#377): every move made on a frame with `yielding` set
 * is taken back out of the positions after it, as if the step never happened. What is left is EV2's own walking,
 * for reversals(): a step aside is the player's doing.
 */
export function withoutSteps(frames) {
  let ox = 0, oz = 0;
  return frames.map((f, i) => {
    if (i > 0 && f.yielding) { ox += f.x - frames[i - 1].x; oz += f.z - frames[i - 1].z; }
    return { ...f, x: f.x - ox, z: f.z - oz };
  });
}

/** Walk and idle toggles: how often the gait changes. */
export const gaitToggles = (frames) => frames.reduce((n, f, i) => n + (i > 0 && f.gait !== frames[i - 1].gait ? 1 : 0), 0);

/**
 * A recorded player walk: the track sampled at 10 Hz and rounded to the centimetre, as the engine bridge writes
 * navigation.trueX / trueZ, with a deterministic 1 cm sway. `at(t)` interpolates between the samples.
 */
export function recordTrack(track, seconds, hz = 10) {
  const samples = [];
  for (let i = 0; i <= seconds * hz; i++) {
    const t = i / hz, p = track.at(t), sway = 0.01 * Math.sin(t * 7.3) * Math.cos(t * 2.1);
    samples.push({ t, x: Math.round((p.x + sway) * 100) / 100, z: Math.round((p.z - sway) * 100) / 100 });
  }
  return {
    samples,
    at(t) {
      const f = clampIndex(t * hz, samples.length - 1), i = Math.floor(f), j = Math.min(samples.length - 1, i + 1), k = f - i;
      return { x: samples[i].x + (samples[j].x - samples[i].x) * k, z: samples[i].z + (samples[j].z - samples[i].z) * k };
    },
  };
}
const clampIndex = (f, max) => Math.max(0, Math.min(max, f));
