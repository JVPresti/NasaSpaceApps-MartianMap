// Lazy access to the shared planner worker for the slope detour button (#69).
// The worker is the same one used by the off-route watcher (#98); the terrain
// and cost grid are not loaded a second time.
import { acquirePlannerService, releasePlannerService } from './plannerService.js';

let active = false;
let acquired = false;
let plannerPromise = null;

export function startSlopeDetourService() {
  active = true;
  return {
    stop() {
      active = false;
      if (acquired) {
        releasePlannerService();
        acquired = false;
        plannerPromise = null;
      }
    },
  };
}

/**
 * Plan a route from the player through the remaining waypoints, avoiding the
 * blocked slope cells. Rejects when the service was stopped or there is no
 * waypoint left.
 * @param {{ x: number, z: number }} from
 * @param {Array<{ x: number, z: number, name: string }>} waypoints
 */
export function requestSlopeDetour(from, waypoints) {
  if (!active) return Promise.reject(new Error('slope detour service is stopped'));
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return Promise.reject(new Error('no remaining waypoints'));
  }
  if (!acquired) {
    acquired = true;
    plannerPromise = acquirePlannerService();
  }
  return plannerPromise.then((client) => {
    if (!active) throw new Error('slope detour service is stopped');
    return client.plan(waypoints, { start: from, smooth: true });
  });
}
