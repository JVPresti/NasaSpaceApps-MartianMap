/**
 * Re-planning and shelter choice.
 *
 * When an event changes the cost grid, the planner has to answer a new
 * question from where the astronaut is now: which safe place is cheapest to
 * reach? Straight-line distance is not enough, because a close shelter may sit
 * behind a steep band. This module compares complete routes and returns the
 * winner together with the reason for the change.
 *
 * Plain JavaScript, no React and no three.js. It runs in the planner worker.
 */

import { applyZones, cloneGrid } from './costGrid.js';
import { planRoute } from './routePlanner.js';

/**
 * Default shelter until issue #40 defines the full list.
 *
 * Mirror of the `HAB` waypoint in `public/marswalk/assets/route.json` (the
 * habitat at x 520, z 600). Keeping it here lets the module work before the
 * data loader exists; callers can pass their own list at any time.
 */
export const DEFAULT_HABITAT = Object.freeze({
  id: 'HAB',
  name: 'HAB · habitat',
  x: 520,
  z: 600,
});

/**
 * Pick the habitat waypoint out of a parsed `route.json`.
 * @param {{waypoints: Array<{name: string, x: number, z: number}>}} routeJson
 * @returns {{id: string, name: string, x: number, z: number}}
 */
export function habitatFromRoute(routeJson) {
  const habitat = routeJson.waypoints.find((waypoint) => waypoint.name === 'HAB');
  if (!habitat) throw new Error('route.json has no HAB waypoint');
  return { id: 'HAB', name: habitat.name, x: habitat.x, z: habitat.z };
}

/**
 * Normalise a shelter and validate its coordinates.
 * @param {{id?: string, name?: string, x: number, z: number}} shelter
 * @returns {{id: string, name: string, x: number, z: number}}
 */
function normaliseShelter(shelter, index) {
  if (!shelter || !Number.isFinite(shelter.x) || !Number.isFinite(shelter.z)) {
    throw new Error(`shelter ${index} needs finite x and z`);
  }
  return {
    id: shelter.id ?? `shelter-${index}`,
    name: shelter.name ?? shelter.id ?? `Shelter ${index + 1}`,
    x: shelter.x,
    z: shelter.z,
  };
}

/**
 * Re-plan from the current position and choose the cheapest reachable shelter.
 *
 * @param {object} grid cost grid from `buildCostGrid`
 * @param {{x: number, z: number}} from current position
 * @param {Array<{id?: string, name?: string, x: number, z: number}>} [shelters]
 * @param {{reason?: string, zones?: Array<object>, smooth?: boolean,
 *   goalRadiusM?: number}} [options]
 * @returns {{
 *   ok: boolean, path: Array<[number, number]>, target: object|null,
 *   reason: string, distance: number, climb: number, steepestSlopeDeg: number,
 *   cost: number, alternatives: Array<object>, zoneCells: number,
 *   gridModified: boolean
 * }}
 */
export function replanToNearestShelter(grid, from, shelters = [DEFAULT_HABITAT], options = {}) {
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.z)) {
    throw new Error('re-plan needs a finite current position');
  }
  if (!Array.isArray(shelters) || shelters.length === 0) {
    throw new Error('re-plan needs at least one shelter');
  }

  const zones = options.zones ?? [];
  const gridModified = zones.length > 0;
  const workingGrid = gridModified ? cloneGrid(grid) : grid;
  const zoneCells = gridModified ? applyZones(workingGrid, zones) : 0;

  const candidates = shelters.map(normaliseShelter);
  const alternatives = [];
  let best = null;
  let bestScore = Infinity;

  for (const shelter of candidates) {
    const route = planRoute(workingGrid, [shelter], {
      start: from,
      smooth: options.smooth,
      goalRadiusM: options.goalRadiusM,
    });
    const alternative = {
      shelter,
      ok: route.ok,
      cost: route.cost,
      distance: route.distance,
      reason: route.reason,
    };
    alternatives.push(alternative);

    // Route cost, not straight-line distance, decides the winner.
    const score = route.ok ? route.cost : Infinity;
    if (route.ok && score < bestScore) {
      best = { route, shelter };
      bestScore = score;
    }
  }

  const reason = options.reason ?? 're-plan requested';

  if (!best) {
    return {
      ok: false,
      path: [],
      target: null,
      reason,
      distance: 0,
      climb: 0,
      steepestSlopeDeg: 0,
      cost: 0,
      alternatives,
      zoneCells,
      gridModified,
      detail: 'no shelter can be reached',
    };
  }

  return {
    ok: true,
    path: best.route.path,
    target: best.shelter,
    reason,
    distance: best.route.distance,
    climb: best.route.climb,
    steepestSlopeDeg: best.route.steepestSlopeDeg,
    cost: best.route.cost,
    alternatives,
    zoneCells,
    gridModified,
  };
}
