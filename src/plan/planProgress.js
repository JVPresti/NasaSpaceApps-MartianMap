import { distanceAlong } from '../sim/routeReview.js';

// Where the EVA stands against the plan, for the mission table during the EVA (A1, Q3). Plain functions.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * The approved plan's leg that reaches a waypoint (eva.plan.legs, frozen at Begin EVA), by the waypoint's name; the
 * current route's legs are the path split at the waypoints, which after an event is the leftover route home.
 * @param {Array<{ to: string | null }>} legs
 * @param {string} name
 */
export function planLegTo(legs, name) {
  return (Array.isArray(legs) ? legs : []).find((leg) => leg?.to === name) ?? null;
}

/**
 * What remains of the plan: the planned legs to the stops not reached or skipped yet.
 * @param {Array<object>} planLegs eva.plan.legs
 * @param {Array<{ name: string }>} waypoints route.waypoints, the start first
 * @param {string[]} done waypoint names reached (route.visited) or skipped (route.skipped)
 * @returns {{ count: number, distanceM: number, timeSec: number, climbM: number, steepestDeg: number | null }}
 */
export function remainingPlan(planLegs, waypoints, done) {
  const finished = new Set(done ?? []);
  const legs = (waypoints ?? []).slice(1).filter((waypoint) => !finished.has(waypoint.name)).map((waypoint) => planLegTo(planLegs, waypoint.name)).filter(Boolean);
  const sum = (key) => legs.reduce((total, leg) => total + (finite(leg[key]) ? leg[key] : 0), 0);
  const slopes = legs.map((leg) => leg.maxSlopeDeg).filter(finite);
  return { count: legs.length, distanceM: sum('distanceM'), timeSec: sum('timeSec'), climbM: sum('climbM'), steepestDeg: slopes.length ? Math.max(...slopes) : null };
}

/**
 * The distance left along a route from a position: the route's length less how far along it the position lies.
 * @param {Array<[number, number]> | null} path
 * @param {{ x: number, z: number } | null} position
 * @returns {number | null} null without a path or a position
 */
export function distanceLeft(path, position) {
  if (!Array.isArray(path) || path.length < 2 || !position || !finite(position.x) || !finite(position.z)) return null;
  let length = 0;
  for (let k = 1; k < path.length; k += 1) length += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  return Math.max(0, length - distanceAlong(position, path));
}
