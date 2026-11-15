/**
 * Web Worker wrapper around the A* planner.
 *
 * The grid is sent once with `setGrid`; each `plan` request then only sends the
 * waypoints and options, so the 3D view keeps its own copy and the main thread
 * stays responsive.
 *
 * Request:  { type: 'setGrid', grid }
 *           { type: 'plan', id, waypoints, options }
 *           { type: 'replan', id, from, shelters, options }
 *           { type: 'detour', id, request }   price a detour to a find (findDetour.js, #71)
 *           { type: 'profiles', id, waypoints, options }   one route per profile (routeProfiles.js, #245);
 *             options: { mast?: { x, y, z } | null, only?: string[] }
 * Response: { type: 'gridReady' }
 *           { type: 'result', id, result }
 *           { type: 'error', id, message }
 */

import { priceDetour } from './findDetour.js';
import { replanToNearestShelter } from './replan.js';
import { planProfiles } from './routeProfiles.js';
import { planRoute } from './routePlanner.js';

const TYPES = ['plan', 'replan', 'detour', 'profiles'];

let grid = null;
// The profile grids and the radio shadow mask, built on the first profiles request and kept for this grid (#245).
let profileCache = new Map();

function reply(message) {
  self.postMessage(message);
}

function run(message) {
  switch (message.type) {
    case 'replan':
      return replanToNearestShelter(grid, message.from, message.shelters, message.options);
    case 'detour':
      return priceDetour(grid, message.request);
    case 'profiles':
      return planProfiles(grid, message.waypoints, { ...message.options, cache: profileCache });
    default:
      return planRoute(grid, message.waypoints, message.options);
  }
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'setGrid') {
    grid = message.grid;
    profileCache = new Map();
    reply({ type: 'gridReady' });
    return;
  }

  if (!TYPES.includes(message.type)) {
    reply({ type: 'error', id: message.id, message: `unknown message type: ${message.type}` });
    return;
  }

  if (!grid) {
    reply({ type: 'error', id: message.id, message: 'no grid: send setGrid before planning' });
    return;
  }

  try {
    reply({ type: 'result', id: message.id, result: run(message) });
  } catch (error) {
    reply({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
  }
});
