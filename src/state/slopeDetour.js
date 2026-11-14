// Lazy planner service for the slope detour button (#69).
//
// The terrain and worker are loaded only when the crew asks for a detour, so a
// normal walk pays nothing. The service is stopped with the rest of the
// simulation.
import { buildCostGrid } from '../sim/costGrid.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';

const TERRAIN_URL = import.meta.env.BASE_URL + 'marswalk/assets/terrain.json';

let service = null;
let stopping = false;

function load() {
  if (!service) {
    service = fetch(TERRAIN_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`terrain.json ${response.status}`);
        return response.json();
      })
      .then(async (terrainJson) => {
        const grid = buildCostGrid(terrainJson);
        const client = createRoutePlannerClient();
        await client.setGrid(grid);
        return client;
      });
  }
  return service;
}

export function startSlopeDetourService() {
  stopping = false;
  return {
    stop() {
      stopping = true;
      if (service) {
        service.then((client) => client.terminate()).catch(() => {});
        service = null;
      }
    },
  };
}

/**
 * Plan a route from the player through the remaining waypoints, avoiding the
 * blocked slope cells. Rejects when the service was stopped.
 * @param {{ x: number, z: number }} from
 * @param {Array<{ x: number, z: number, name: string }>} waypoints
 */
export function requestSlopeDetour(from, waypoints) {
  if (stopping) return Promise.reject(new Error('slope detour service is stopped'));
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return Promise.reject(new Error('no remaining waypoints'));
  }
  return load().then((client) => client.plan(waypoints, { start: from, smooth: true }));
}
