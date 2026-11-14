// Browser wiring for the off-route watcher (#98). Loads the terrain once a
// route exists, sends the cost grid to a planner worker, then starts the
// simulation runner.
//
// The runner itself is plain JavaScript and testable (src/sim/offRoute.js).
import { buildCostGrid } from '../sim/costGrid.js';
import { startOffRouteRunner } from '../sim/offRoute.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { useMissionStore } from './store.js';

const TERRAIN_URL = import.meta.env.BASE_URL + 'marswalk/assets/terrain.json';

function hasRoute(state) {
  return Array.isArray(state.route?.path)
    && state.route.path.length >= 2
    && Array.isArray(state.route.waypoints)
    && state.route.waypoints.length > 0;
}

/**
 * @param {{ store?: object }} [options]
 * @returns {{ stop: () => void }}
 */
export function startOffRoute({ store = useMissionStore } = {}) {
  let stopped = false;
  let loading = false;
  let failed = false;
  let client = null;
  let runner = null;

  function maybeStart() {
    if (stopped || loading || failed || runner) return;
    if (!hasRoute(store.getState())) return;
    loading = true;

    fetch(TERRAIN_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`terrain.json ${response.status}`);
        return response.json();
      })
      .then(async (terrainJson) => {
        if (stopped) return;
        const grid = buildCostGrid(terrainJson);
        client = createRoutePlannerClient();
        await client.setGrid(grid);
        if (stopped) {
          client.terminate();
          client = null;
          return;
        }
        runner = startOffRouteRunner({
          store,
          plan: (waypoints, options) => client.plan(waypoints, options),
        });
        loading = false;
      })
      .catch((error) => {
        loading = false;
        failed = true;
        if (!stopped) console.error('off-route watcher not started:', error);
      });
  }

  const unsubscribe = store.subscribe(maybeStart);
  maybeStart();

  return {
    stop() {
      stopped = true;
      unsubscribe();
      if (runner) runner.stop();
      if (client) client.terminate();
    },
  };
}
