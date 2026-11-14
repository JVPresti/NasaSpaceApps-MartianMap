// One planner worker shared by the off-route watcher (#98) and the slope
// detour (#69). The terrain and cost grid are loaded once and released when the
// last consumer stops.
import { buildCostGrid } from '../sim/costGrid.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';

const TERRAIN_URL = import.meta.env.BASE_URL + 'marswalk/assets/terrain.json';

let servicePromise = null;
let references = 0;

function load() {
  return fetch(TERRAIN_URL)
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

export function acquirePlannerService() {
  references += 1;
  if (!servicePromise) servicePromise = load();
  return servicePromise;
}

export function releasePlannerService() {
  references = Math.max(0, references - 1);
  if (references > 0 || !servicePromise) return;
  const pending = servicePromise;
  servicePromise = null;
  pending.then((client) => client.terminate()).catch(() => {});
}
