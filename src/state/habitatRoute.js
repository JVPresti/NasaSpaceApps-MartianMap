// A route from the habitat seat (#55) becomes the surface player's active route. src/net/habitat.js calls this when an
// `rt` arrives or a welcome carries one; it is plain data in and out, so the rule is tested without a room.
//
// The rule:
//   - route.path is the habitat's path, in metres. The HUD nav line, the minimap and the elevation profile draw it.
//   - route.waypoints keeps this player's stops that lie within NEAR_PATH_M of the new path, in the order the path
//     passes them. If none of them is at the end of the path, the path's last point becomes an END waypoint, so the
//     nav line always has a target that the path reaches.
//   - Stops the path passes before the point nearest the player count as visited, so the nav line points ahead.
//   - route.origin records where the route came from: { kind: 'habitat', by, at }. The planner's own routes leave it null.
//   - finds.routeKey is set to these waypoints, so opening the mission table does not plan over the habitat's path
//     (src/plan/useRoutePlanner.js reads it once).
// No React, no three.js, nothing from src/net/.
import { waypointKey } from '../plan/routePlan.js';

export const NEAR_PATH_M = 8;
export const HABITAT_END_NAME = 'END · route from the habitat';
export const HABITAT_ROUTE_REASON = 'Route from the habitat';

const finite = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);

/** Index of the path vertex nearest to p, and its distance. */
export function nearestVertex(path, p) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - p.x, path[i][1] - p.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distanceM: bestD };
}

export function pathLengthM(path) {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return sum;
}


/**
 * @param {object} route the store's current `route`
 * @param {Array<[number, number]>} path the habitat's path in metres, at least two points
 * @param {{ position?: { x: number, z: number } | null, by: string, at: number }} from
 * @returns {{ route: object, routeKey: string }} the new route and the waypoint key for finds.routeKey
 */
export function adoptHabitatRoute(route, path, { position = null, by, at }) {
  const stops = (Array.isArray(route?.waypoints) ? route.waypoints : []).filter(finite);
  const near = stops
    .map((w, order) => ({ w, order, ...nearestVertex(path, w) }))
    .filter((s) => s.distanceM <= NEAR_PATH_M)
    .sort((a, b) => a.index - b.index || a.order - b.order);
  const last = path.length - 1;
  const end = path[last];
  const endsAtStop = near.length > 0 && Math.hypot(near.at(-1).w.x - end[0], near.at(-1).w.z - end[1]) <= NEAR_PATH_M;
  const kept = near.map((s) => ({ w: s.w, index: s.index }));
  if (!endsAtStop) kept.push({ w: { name: HABITAT_END_NAME, x: end[0], z: end[1] }, index: last });

  // The first stop the path reaches after the point nearest the player; the start of the path counts as passed.
  const here = finite(position) ? nearestVertex(path, position).index : 0;
  let nextIndex = kept.findIndex((s) => s.index > here);
  if (nextIndex < 0) nextIndex = kept.length - 1;
  const waypoints = kept.map((s) => s.w);
  const distanceM = pathLengthM(path);

  return {
    route: {
      ...route,
      waypoints,
      path: path.map(([x, z]) => [x, z]),
      nextIndex,
      visited: waypoints.slice(0, nextIndex).map((w) => w.name),
      distanceM,
      climbM: null,
      steepestSlopeDeg: null,
      etaSec: distanceM,          // 1 m/s on the flat, as applyPlannedRoute (src/sim/routeUpdate.js)
      reason: HABITAT_ROUTE_REASON,
      skipped: [],
      origin: { kind: 'habitat', by, at },
    },
    routeKey: waypointKey(waypoints),
  };
}
