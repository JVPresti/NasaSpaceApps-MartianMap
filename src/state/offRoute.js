// Browser wiring for the off-route watcher (#98). Acquires the shared planner
// worker once a route exists, then starts the simulation runner.
//
// The runner itself is plain JavaScript and testable (src/sim/offRoute.js).
import { startOffRouteRunner } from '../sim/offRoute.js';
import { acquirePlannerService, releasePlannerService } from './plannerService.js';
import { useMissionStore } from './store.js';

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
  let acquired = false;
  let runner = null;

  function maybeStart() {
    if (stopped || loading || failed || runner) return;
    if (!hasRoute(store.getState())) return;
    loading = true;
    acquired = true;

    acquirePlannerService()
      .then((client) => {
        if (stopped) {
          releasePlannerService();
          acquired = false;
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
        releasePlannerService();
        acquired = false;
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
      if (acquired) releasePlannerService();
    },
  };
}
