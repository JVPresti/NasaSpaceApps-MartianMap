/**
 * Off-route detection and re-planning.
 *
 * The planner can already re-plan from the current position (#23), but only
 * events ask it to. This module watches the distance to the planned route and,
 * after the crew has been well away from it for a few seconds while moving,
 * asks for a new route to the next unvisited waypoint.
 *
 * Plain JavaScript: no React, no three.js and no worker code. The browser
 * runner in `src/state/offRoute.js` supplies the A* worker and the store.
 */

import { applyPlannedRoute } from './routeUpdate.js';
import { truePosition } from './navigation.js';

/** Defaults from issue #98: about 20 m, about 5 s, one re-plan every few seconds. */
export const OFF_ROUTE_DEFAULTS = Object.freeze({
  thresholdM: 20,
  holdSec: 5,
  cooldownSec: 10,
  /** A tiny movement is enough to prove the crew is walking, not standing still. Metres. */
  minMoveM: 2,
});

/**
 * Shortest distance from a point to a polyline, in metres.
 * @param {{ x: number, z: number }} point
 * @param {Array<[number, number]>} path
 * @returns {number} Infinity when there is no usable path
 */
export function distanceToPath(point, path) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return Infinity;
  if (!Array.isArray(path) || path.length < 2) return Infinity;
  let best = Infinity;
  for (let index = 0; index < path.length - 1; index += 1) {
    const [ax, az] = path[index];
    const [bx, bz] = path[index + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 > 0
      ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / length2))
      : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    best = Math.min(best, Math.hypot(point.x - px, point.z - pz));
  }
  return best;
}

/**
 * @typedef {{ thresholdM?: number, holdSec?: number, cooldownSec?: number, minMoveM?: number }} OffRouteOptions
 */

/**
 * Stateful detector. Feed it one update per simulation tick.
 * @param {OffRouteOptions} [options]
 */
export function createOffRouteMonitor(options = {}) {
  const settings = { ...OFF_ROUTE_DEFAULTS, ...options };
  let offSinceSec = null;
  let lastReplanSec = -Infinity;
  let lastPoint = null;
  let movedOffM = 0;

  function reset() {
    offSinceSec = null;
    lastPoint = null;
    movedOffM = 0;
  }

  /**
   * @param {{ point: { x: number, z: number } | null,
   *   path: Array<[number, number]> | null,
   *   missionTimeSec: number,
   *   canReplan: boolean,
   *   eventActive?: boolean }} input
   * @returns {{ trigger: boolean, offRouteM: number, offForSec: number, reason: string | null }}
   */
  function update({ point, path, missionTimeSec, canReplan, eventActive = false }) {
    if (!canReplan || eventActive) {
      reset();
      return { trigger: false, offRouteM: 0, offForSec: 0, reason: eventActive ? 'event-route' : 'no-route' };
    }
    if (!point || !Number.isFinite(missionTimeSec) || !Array.isArray(path) || path.length < 2) {
      reset();
      return { trigger: false, offRouteM: 0, offForSec: 0, reason: 'no-data' };
    }

    const offRouteM = distanceToPath(point, path);
    if (!(offRouteM > settings.thresholdM)) {
      reset();
      return { trigger: false, offRouteM, offForSec: 0, reason: null };
    }

    if (offSinceSec === null) {
      offSinceSec = missionTimeSec;
      movedOffM = 0;
    } else if (lastPoint) {
      movedOffM += Math.hypot(point.x - lastPoint.x, point.z - lastPoint.z);
    }
    lastPoint = { x: point.x, z: point.z };

    const offForSec = Math.max(0, missionTimeSec - offSinceSec);
    const movedEnough = movedOffM >= settings.minMoveM;
    const cooledDown = missionTimeSec - lastReplanSec >= settings.cooldownSec;

    if (offForSec >= settings.holdSec && movedEnough && cooledDown) {
      lastReplanSec = missionTimeSec;
      offSinceSec = missionTimeSec;
      movedOffM = 0;
      return {
        trigger: true,
        offRouteM,
        offForSec,
        reason: 'Off route: new route from your position',
      };
    }

    return { trigger: false, offRouteM, offForSec, reason: null };
  }

  return { update, reset, settings };
}

/**
 * Start the off-route watcher.
 *
 * `route.nextIndex` is the contract from #61: the first waypoint not visited
 * yet. Until that issue lands, it stays 0; this runner still works and its
 * tests set the value explicitly.
 *
 * @param {{ store: { getState: Function, setState: Function },
 *   plan: (waypoints: Array<object>, options: object) => Promise<object>,
 *   now?: () => number, setInterval?: Function, clearInterval?: Function,
 *   monitor?: ReturnType<typeof createOffRouteMonitor> }} options
 */
export function startOffRouteRunner({
  store,
  plan,
  now = () => Date.now(),
  setInterval: si = setInterval,
  clearInterval: ci = clearInterval,
  monitor = createOffRouteMonitor(),
}) {
  let stopped = false;
  let planning = false;
  let lastPoint = null;

  function missionTimeSec() {
    const value = store.getState().mission?.elapsedSec;
    if (Number.isFinite(value)) return value;
    return now() / 1000;
  }

  async function tick() {
    if (stopped || planning) return;
    const state = store.getState();
    // Physical position: leaving the route happens in the real world, not in the estimate (#42).
    const truth = truePosition(state.navigation);
    const point = Number.isFinite(truth.x) && Number.isFinite(truth.z) ? truth : null;

    if (state.mode !== 'walk') {
      monitor.reset();
      lastPoint = point;
      return;
    }

    const waypoints = Array.isArray(state.route?.waypoints) ? state.route.waypoints : [];
    const nextIndex = Number.isInteger(state.route?.nextIndex) ? state.route.nextIndex : 0;
    const remaining = waypoints.slice(nextIndex);
    const eventActive = Object.values(state.alerts ?? {}).some((alert) => alert && alert.active);
    const decision = monitor.update({
      point,
      path: state.route?.path,
      missionTimeSec: missionTimeSec(),
      canReplan: remaining.length > 0,
      eventActive,
    });

    if (!decision.trigger || !point) {
      lastPoint = point;
      return;
    }

    planning = true;
    try {
      const result = await Promise.resolve(plan(remaining, { start: point, smooth: true }));
      if (stopped) return;
      applyPlannedRoute(store, result, {
        reason: decision.reason ?? 'Off route: new route from your position',
        etaSec: result.distance,
      });
    } catch (error) {
      if (!stopped) {
        applyPlannedRoute(store, {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        }, { reason: decision.reason ?? 'Off route re-plan' });
      }
    } finally {
      planning = false;
      lastPoint = point;
    }
  }

  const timer = si(() => { tick().catch(() => {}); }, 1000);
  return {
    tick,
    stop: () => {
      if (stopped) return;
      stopped = true;
      ci(timer);
    },
    monitor,
    get lastPoint() { return lastPoint; },
  };
}
