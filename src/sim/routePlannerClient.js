/**
 * Main-thread client for `routePlanner.worker.js`.
 *
 * Usage:
 *   const planner = createRoutePlannerClient();
 *   await planner.setGrid(costGrid);
 *   const result = await planner.plan(route.waypoints);
 *   const rescue = await planner.replan({ from, shelters, reason });
 *   planner.terminate();
 *
 * There is no React or three.js import here; the Plan screen owns the client.
 */

/**
 * @param {{workerFactory?: () => Worker}} [options]
 * @returns {{
 *   setGrid: (grid: object) => Promise<void>,
 *   plan: (waypoints: Array<object>, options?: object) => Promise<object>,
 *   replan: (request: {from: object, shelters?: Array<object>, options?: object}) => Promise<object>,
 *   detour: (request: object) => Promise<object>,
 *   profiles: (waypoints: Array<object>, options?: object) => Promise<object>,
 *   needs: (needs: object, site: object, options?: object) => Promise<object>,
 *   terminate: () => void
 * }}
 */
export function createRoutePlannerClient(options = {}) {
  const worker = options.workerFactory
    ? options.workerFactory()
    : new Worker(new URL('./routePlanner.worker.js', import.meta.url), { type: 'module' });

  let nextId = 1;
  let gridReady = false;
  const pending = new Map();
  const readyWaiters = [];

  function failAll(error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }

  worker.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'gridReady') {
      gridReady = true;
      for (const resolve of readyWaiters.splice(0)) resolve();
      return;
    }

    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.type === 'error') {
      request.reject(new Error(message.message));
    } else {
      request.resolve(message.result);
    }
  });

  worker.addEventListener('error', (event) => {
    failAll(event.error instanceof Error ? event.error : new Error(event.message || 'planner worker failed'));
  });

  return {
    setGrid(grid) {
      gridReady = false;
      return new Promise((resolve) => {
        readyWaiters.push(resolve);
        worker.postMessage({ type: 'setGrid', grid });
      });
    },

    plan(waypoints, planOptions = {}) {
      if (!gridReady) {
        return Promise.reject(new Error('route planner has no grid yet'));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'plan', id, waypoints, options: planOptions });
      });
    },

    replan(request) {
      if (!gridReady) {
        return Promise.reject(new Error('route planner has no grid yet'));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({
          type: 'replan',
          id,
          from: request.from,
          shelters: request.shelters,
          options: request.options,
        });
      });
    },

    /** Price a detour to a find: the request of priceDetour in findDetour.js (#71). */
    detour(request) {
      if (!gridReady) {
        return Promise.reject(new Error('route planner has no grid yet'));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'detour', id, request });
      });
    },

    /**
     * One route per route profile (routeProfiles.js, #245).
     * @param {Array<object>} waypoints the start first
     * @param {{ mast?: { x: number, y?: number, z: number } | null, only?: string[] }} [profileOptions]
     */
    profiles(waypoints, profileOptions = {}) {
      if (!gridReady) {
        return Promise.reject(new Error('route planner has no grid yet'));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'profiles', id, waypoints, options: profileOptions });
      });
    },

    /**
     * The route from the crew's needs (missionNeeds.js) and the profile comparison on its stops.
     * @param {object} needs the store's needs plus `profile`, the profile chosen at the table
     * @param {{ start: object, stops: Array<object>, traverse: Array<object> | null, constants: object }} site
     * @param {{ mast?: { x: number, y?: number, z: number } | null }} [needsOptions]
     * @returns {Promise<{ plan: object, profiles: Record<string, object> | null }>}
     */
    needs(needs, site, needsOptions = {}) {
      if (!gridReady) {
        return Promise.reject(new Error('route planner has no grid yet'));
      }
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'needs', id, needs, site, options: needsOptions });
      });
    },

    terminate() {
      failAll(new Error('route planner terminated'));
      worker.terminate();
    },
  };
}
