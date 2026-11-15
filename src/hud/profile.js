/**
 * Elevation profile of a planned route (#68).
 *
 * Pure helpers: sample the route every few metres, keep the height and slope,
 * place the waypoints by distance along the path and project the current
 * position onto the same axis. The SVG component lives in
 * `src/hud/ElevationProfile.jsx`.
 */

import { COST_CONSTANTS } from '../sim/costGrid.js';

/** One source with the planner, the slope layer and the slope-ahead warning: red over 20 degrees, amber over 15 (#293). */
export const SLOPE_CAUTION_DEG = COST_CONSTANTS.SLOPE_CAUTION_DEG;
export const SLOPE_NO_GO_DEG = COST_CONSTANTS.SLOPE_LIMIT_DEG;
export const PROFILE_STEP_M = 10;

/** @param {number} slopeDeg */
export function slopeClass(slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return 'ok';
  if (slopeDeg > SLOPE_NO_GO_DEG) return 'nogo';
  if (slopeDeg > SLOPE_CAUTION_DEG) return 'caution';
  return 'ok';
}

function cumulativeLengths(path) {
  const lengths = [0];
  for (let index = 1; index < path.length; index += 1) {
    const [ax, az] = path[index - 1];
    const [bx, bz] = path[index];
    lengths.push(lengths[index - 1] + Math.hypot(bx - ax, bz - az));
  }
  return lengths;
}

/**
 * Point and interpolated height at a distance along the polyline.
 * @param {Array<[number, number]>} path
 * @param {number[]} lengths cumulative lengths
 * @param {number} distanceM
 */
function pointAt(path, lengths, distanceM) {
  const total = lengths[lengths.length - 1];
  const d = Math.max(0, Math.min(total, distanceM));
  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < d) index += 1;
  const [ax, az] = path[index - 1];
  const [bx, bz] = path[index];
  const segment = lengths[index] - lengths[index - 1] || 1;
  const t = (d - lengths[index - 1]) / segment;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
}

/**
 * Nearest point of the path to a world position, with its distance along the route.
 * @param {Array<[number, number]>} path
 * @param {{ x: number, z: number }} point
 * @returns {{ distanceM: number, rangeM: number } | null}
 */
export function positionAlongPath(path, point) {
  if (!Array.isArray(path) || path.length < 2 || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const lengths = cumulativeLengths(path);
  let best = { distanceM: 0, rangeM: Infinity };
  for (let index = 0; index < path.length - 1; index += 1) {
    const [ax, az] = path[index];
    const [bx, bz] = path[index + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / length2)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const rangeM = Math.hypot(point.x - px, point.z - pz);
    if (rangeM < best.rangeM) {
      best = {
        distanceM: lengths[index] + t * Math.sqrt(length2),
        rangeM,
      };
    }
  }
  return best;
}

/**
 * Build the chart data.
 * @param {Array<[number, number]>} path
 * @param {Array<{ name: string }>} waypoints
 * @param {(x: number, z: number) => number} heightAt
 * @param {{ stepM?: number, slopeAt?: (x: number, z: number) => number,
 *   position?: { x: number, z: number } | null }} [options]
 */
export function buildProfile(path, waypoints, heightAt, options = {}) {
  if (!Array.isArray(path) || path.length < 2 || typeof heightAt !== 'function') return null;
  const stepM = options.stepM ?? PROFILE_STEP_M;
  const lengths = cumulativeLengths(path);
  const totalM = lengths[lengths.length - 1];
  if (!(totalM > 0)) return null;

  const count = Math.max(2, Math.ceil(totalM / stepM) + 1);
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const distanceM = totalM * index / (count - 1);
    const point = pointAt(path, lengths, distanceM);
    const heightM = heightAt(point.x, point.z);
    const slopeDeg = options.slopeAt ? options.slopeAt(point.x, point.z) : 0;
    samples.push({ distanceM, heightM, slopeDeg });
  }

  if (!options.slopeAt) {
    for (let index = 0; index < samples.length; index += 1) {
      const before = samples[Math.max(0, index - 1)];
      const after = samples[Math.min(samples.length - 1, index + 1)];
      const run = after.distanceM - before.distanceM;
      samples[index].slopeDeg = run > 0 ? Math.abs(Math.atan2(after.heightM - before.heightM, run) * 180 / Math.PI) : 0;
    }
  }

  const waypointMarks = (waypoints ?? []).map((waypoint, index) => {
    const onPath = positionAlongPath(path, waypoint);
    return {
      index,
      name: waypoint.name ?? `WP${index + 1}`,
      distanceM: onPath ? onPath.distanceM : 0,
    };
  });

  const positionM = options.position ? positionAlongPath(path, options.position)?.distanceM ?? null : null;
  const heights = samples.map((sample) => sample.heightM);
  return {
    samples,
    waypoints: waypointMarks,
    totalM,
    minHeightM: Math.min(...heights),
    maxHeightM: Math.max(...heights),
    positionM,
  };
}
