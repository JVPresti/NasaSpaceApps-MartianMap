// One planner worker shared by the off-route watcher (#98) and the slope
// detour (#69). The terrain and cost grid are loaded once and released when the
// last consumer stops.
import { loadCostGrid } from '../data/dataFiles.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';

let servicePromise = null;
let references = 0;

function load() {
  return loadCostGrid()
    .then(async (grid) => {
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
