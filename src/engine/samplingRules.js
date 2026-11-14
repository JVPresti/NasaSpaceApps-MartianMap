// Sampling rules (#36), kept free of three.js so they can be tested quickly (sampling.js does the drawing side).
// Coordinates: x east, z south, y up, metres from Cheyava Falls. Yaw is view.yaw: 0 looks north (-z), forward = (sin, -cos).

export const SAMPLE_REACH_M = 1.5;    // "within reach": horizontal distance from the feet to the clicked point (an arm plus a short step)
export const PHOTO_RANGE_M = 8;       // the helmet camera documents a target up to this far along the line of sight
export const MIN_ROCK_D_M = 0.35;     // loose rocks this wide and wider can be chipped; smaller ones are gravel, scooped as soil (same cut as rocks.collide)
export const CASE_REACH_M = 2.0;      // the partner's case must be this close to pour into it
// Where to stand for each clip (assets_astronaut/arms.json "clips", assets_props/props.json "hand_over"):
export const ROCK_STAND_M = 0.70;     // feet 0.70 m from the rock face (0.20 m camera lean + 0.50 m scoop reach)
export const GROUND_STAND_M = 0.47;   // the scoop meets the soil 0.47 m ahead of the feet
export const CASE_STAND_M = 0.85;     // 0.85 m from the case, on the side away from the partner

export const CHEYAVA_FALLS = 'Cheyava Falls';
export const BRIGHT_ANGEL = 'Bright Angel';   // the layered outcrop at WP3 (rocks.js buildOutcrop)

/** Horizontal distance between two { x, z } points. */
export const horizontalDistance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

/** True when a point is within reach of the feet. */
export const inReach = (feet, point, reachM = SAMPLE_REACH_M) => horizontalDistance(feet, point) <= reachM;

/** Shortest signed turn from yaw a to yaw b, in -PI..PI. */
export function angleDelta(a, b) {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
}

/**
 * First point where a ray meets a height field, by marching in `step` metre steps and interpolating the crossing.
 * @param {{ x, y, z }} o origin; @param {{ x, y, z }} d unit direction; @param {(x, z) => number} heightAt
 * @returns {{ distance: number, point: { x, y, z } } | null} null when the ray stays above the ground up to maxDist
 */
export function marchGround(o, d, heightAt, maxDist, step = 0.1) {
  let prevT = 0, prevGap = o.y - heightAt(o.x, o.z);
  if (!(prevGap > 0)) return null;   // starts under the ground
  for (let t = step; t < maxDist + step; t += step) {
    const tt = Math.min(t, maxDist), gap = o.y + d.y * tt - heightAt(o.x + d.x * tt, o.z + d.z * tt);
    if (gap <= 0) {
      const hit = prevT + (tt - prevT) * prevGap / (prevGap - gap);
      return { distance: hit, point: { x: o.x + d.x * hit, y: o.y + d.y * hit, z: o.z + d.z * hit } };
    }
    if (tt >= maxDist) break;
    prevT = tt; prevGap = gap;
  }
  return null;
}

/** Distance along a ray (unit direction) to a sphere, or null when it misses or the sphere is behind. */
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, q = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - q;
  if (disc < 0) return null;
  const s = Math.sqrt(disc), t = -b - s >= 0 ? -b - s : -b + s;
  return t >= 0 ? t : null;
}

/** Distance along a ray (unit direction) to the side of an upright cylinder (base centre c, radius r, height h), or null. */
export function rayCylinder(o, d, c, r, h) {
  const ox = o.x - c.x, oz = o.z - c.z, a = d.x * d.x + d.z * d.z;
  if (a < 1e-12) return null;   // looking straight down or up
  const b = ox * d.x + oz * d.z, disc = b * b - a * (ox * ox + oz * oz - r * r);
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / a, (-b + s) / a]) { const y = o.y + d.y * t - c.y; if (t >= 0 && y >= 0 && y <= h) return t; }
  return null;
}

/** Nearest rock (spheres { x, y, z, r }) along a ray within maxDist: { rock, distance, point } or null. */
export function pickRock(o, d, rocks, maxDist) {
  let best = null;
  for (const rock of rocks) {
    const t = raySphere(o, d, rock, rock.r);
    if (t !== null && t <= maxDist && (!best || t < best.distance)) best = { rock, distance: t, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } };
  }
  return best;
}

/**
 * What the crosshair is on. Takes the hits found along the line of sight ({ kind: 'rock' | 'ground', site, distance, point })
 * and keeps the nearest one, with its horizontal distance from the feet and whether it is within reach. A nearer hit of
 * any other kind (the partner, the case) hides what is behind it. A hit may carry `rock` (the sphere of a loose rock);
 * it is passed through for the stand point.
 * @returns {{ kind: 'rock' | 'ground', site: string | null, point: { x, y, z }, distanceM: number, inReach: boolean, rock: object | null } | null}
 */
export function classifyTarget(hits, feet, { reachM = SAMPLE_REACH_M, rangeM = PHOTO_RANGE_M } = {}) {
  let best = null;
  for (const h of hits) if (h && h.distance <= rangeM && (!best || h.distance < best.distance)) best = h;
  if (!best || (best.kind !== 'rock' && best.kind !== 'ground')) return null;
  const distanceM = horizontalDistance(feet, best.point);
  return { kind: best.kind, site: best.site ?? null, point: best.point, distanceM, inReach: distanceM <= reachM, rock: best.rock ?? null };
}

/** Stand offM short of a point, on the line from where the player is, facing it. yaw null: right underfoot, keep the heading. */
export function standPoint(feet, point, offM) {
  const dx = point.x - feet.x, dz = point.z - feet.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return { x: feet.x, z: feet.z, yaw: null };
  const ux = dx / d, uz = dz / d;
  return { x: point.x - ux * offM, z: point.z - uz * offM, yaw: Math.atan2(ux, -uz) };
}

/** Hand-over step 2: stand offM from the case on the side away from the partner, facing the case (props.json "hand_over"). */
export function pourStand(casePos, partnerPos, offM = CASE_STAND_M, feet = null) {
  const dx = partnerPos.x - casePos.x, dz = partnerPos.z - casePos.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return standPoint(feet || casePos, casePos, offM);
  const ux = dx / d, uz = dz / d;
  return { x: casePos.x - ux * offM, z: casePos.z - uz * offM, yaw: Math.atan2(ux, -uz) };
}

/**
 * Where the partner's tool case is in the hand-over sequence.
 * @param {{ present: boolean, carrying: boolean, bending: boolean, wantCarry: boolean, requested: boolean }} p
 *   requested: the player asked for the case and it is not down yet
 * @returns {'none' | 'carried' | 'coming' | 'setting-down' | 'down' | 'picking-up'}
 */
export function caseState({ present, carrying, bending, wantCarry, requested }) {
  if (!present) return 'none';
  if (bending) return wantCarry ? 'picking-up' : 'setting-down';
  if (!carrying) return 'down';
  return requested ? 'coming' : 'carried';
}

/**
 * What each input does right now. Clicks and keys are ignored (null) while a clip plays.
 *   click: 'collect' when a rock or the ground is within reach and the scoop is free
 *   photo (P): 'photo' when a target is in the helmet camera's range and no clip plays
 *   stow (E): 'stow' while holding a sample
 *   case (F): 'pour' while holding a sample next to the open case; 'call-case' while the partner carries it;
 *             'pick-up-case' when the case is down and the scoop is free
 * @param {{ walk: boolean, phase: 'idle' | 'collecting' | 'holding' | 'stowing' | 'pouring', target: object | null,
 *   caseState: string, caseInReach: boolean }} s
 */
export function inputActions({ walk, phase, target, caseState: cs, caseInReach }) {
  const a = { click: null, photo: null, stow: null, case: null };
  if (!walk) return a;
  const free = phase === 'idle', holding = phase === 'holding';
  if (free && target && target.inReach) a.click = 'collect';
  if ((free || holding) && target) a.photo = 'photo';
  if (holding) a.stow = 'stow';
  if (holding && cs === 'down' && caseInReach) a.case = 'pour';
  else if ((free || holding) && cs === 'carried') a.case = 'call-case';
  else if (free && cs === 'down') a.case = 'pick-up-case';
  return a;
}
