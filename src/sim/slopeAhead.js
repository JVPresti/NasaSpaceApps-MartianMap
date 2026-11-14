/**
 * Look-ahead slope warning and the local no-go mask (#69).
 *
 * The engine's `slopeAt(x, z)` is the only terrain input. A heading of 0 is
 * north (-z), clockwise, the same convention as the HUD.
 */

export const LOOK_AHEAD_M = 20;
export const LOOK_STEP_M = 2;
export const SLOPE_NO_GO_DEG = 25;
export const CELL_M = 3;
export const ZONE_RADIUS_M = 18;

/**
 * @param {{ x: number, z: number }} point
 * @param {number} headingDeg
 * @param {(x: number, z: number) => number} slopeAt
 * @param {{ distanceM?: number, stepM?: number, limitDeg?: number }} [options]
 * @returns {{ blocked: boolean, maxSlopeDeg: number, distanceM: number | null, at: { x: number, z: number } | null }}
 */
export function lookAhead(point, headingDeg, slopeAt, options = {}) {
  const distanceM = options.distanceM ?? LOOK_AHEAD_M;
  const stepM = options.stepM ?? LOOK_STEP_M;
  const limitDeg = options.limitDeg ?? SLOPE_NO_GO_DEG;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) || !Number.isFinite(headingDeg)) {
    return { blocked: false, maxSlopeDeg: 0, distanceM: null, at: null };
  }
  const rad = headingDeg * Math.PI / 180;
  let maxSlopeDeg = 0;
  let blockedAt = null;
  for (let distance = stepM; distance <= distanceM; distance += stepM) {
    const x = point.x + Math.sin(rad) * distance;
    const z = point.z - Math.cos(rad) * distance;
    const slope = slopeAt(x, z);
    maxSlopeDeg = Math.max(maxSlopeDeg, slope);
    if (slope > limitDeg && !blockedAt) blockedAt = { x, z, distanceM: distance };
  }
  return {
    blocked: Boolean(blockedAt),
    maxSlopeDeg,
    distanceM: blockedAt?.distanceM ?? null,
    at: blockedAt ? { x: blockedAt.x, z: blockedAt.z } : null,
  };
}

/**
 * Local cells over the slope limit, relative to the player. Used for the
 * ground patch and the small map in the warning.
 * @param {{ x: number, z: number }} point
 * @param {(x: number, z: number) => number} slopeAt
 * @param {{ radiusM?: number, cellM?: number, limitDeg?: number }} [options]
 * @returns {Array<{ x: number, z: number, slopeDeg: number }>}
 */
export function noGoCells(point, slopeAt, options = {}) {
  const radiusM = options.radiusM ?? ZONE_RADIUS_M;
  const cellM = options.cellM ?? CELL_M;
  const limitDeg = options.limitDeg ?? SLOPE_NO_GO_DEG;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return [];
  const cells = [];
  for (let dz = -radiusM; dz <= radiusM; dz += cellM) {
    for (let dx = -radiusM; dx <= radiusM; dx += cellM) {
      if (dx * dx + dz * dz > radiusM * radiusM) continue;
      const x = point.x + dx;
      const z = point.z + dz;
      const slopeDeg = slopeAt(x, z);
      if (slopeDeg > limitDeg) cells.push({ x, z, slopeDeg });
    }
  }
  return cells;
}

/**
 * Extra distance and time of a detour compared with the current remaining route.
 * @param {{ distance: number }} detour result of the planner
 * @param {number} currentRemainingM
 * @param {number} [speedMs] suited walking speed, SIM
 */
export function detourExtra(detour, currentRemainingM, speedMs = 1) {
  const addedM = Math.max(0, (detour?.distance ?? 0) - (Number.isFinite(currentRemainingM) ? currentRemainingM : 0));
  return { addedM, addedSec: addedM / (speedMs > 0 ? speedMs : 1) };
}
