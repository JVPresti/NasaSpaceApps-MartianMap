/**
 * Waypoint arrival and next-waypoint numbers (#61).
 *
 * Runs in Walk mode, writes the distance and bearing to the next waypoint into
 * `navigation`, and advances `route.nextIndex` when the astronaut enters the
 * arrival radius. Science targets use 2 m; every other waypoint uses 5 m.
 *
 * Plain JavaScript: no React, no three.js.
 */
import { bearingDeg } from '../hud/format.js';

export const WAYPOINT_TICK_MS = 200;
export const ARRIVAL_RADIUS_M = 5;
export const SCIENCE_ARRIVAL_RADIUS_M = 2;

/** Science stops named in the assets and #66: walk closer before they count as reached. */
export function arrivalRadiusM(name) {
  return /cheyava|bright angel/i.test(String(name ?? '')) ? SCIENCE_ARRIVAL_RADIUS_M : ARRIVAL_RADIUS_M;
}

/**
 * @param {{ store: { getState: Function, setState: Function },
 *   setInterval?: Function, clearInterval?: Function }} options
 */
export function startWaypointRunner({ store, setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let stopped = false;

  function tick() {
    if (stopped) return;
    const state = store.getState();
    if (state.mode !== 'walk') return;
    const nav = state.navigation;
    if (!nav || !Number.isFinite(nav.x) || !Number.isFinite(nav.z)) return;

    const waypoints = Array.isArray(state.route?.waypoints) ? state.route.waypoints : [];
    const nextIndex = Number.isInteger(state.route?.nextIndex) ? state.route.nextIndex : 0;
    if (nextIndex < 0 || nextIndex >= waypoints.length) return;

    const waypoint = waypoints[nextIndex];
    if (!Number.isFinite(waypoint?.x) || !Number.isFinite(waypoint?.z)) return;

    const rangeM = Math.hypot(waypoint.x - nav.x, waypoint.z - nav.z);
    const bearing = bearingDeg(nav, waypoint);
    store.setState((current) => ({
      navigation: {
        ...current.navigation,
        waypointRangeM: rangeM,
        waypointBearingDeg: bearing,
      },
    }));

    if (rangeM <= arrivalRadiusM(waypoint.name)) {
      store.setState((current) => {
        const visited = Array.isArray(current.route?.visited) ? current.route.visited : [];
        return {
          route: {
            ...current.route,
            nextIndex: Math.min(nextIndex + 1, waypoints.length),
            visited: [...visited, waypoint.name],
          },
        };
      });
    }
  }

  const timer = si(tick, WAYPOINT_TICK_MS);
  tick();
  return {
    tick,
    stop: () => {
      if (stopped) return;
      stopped = true;
      ci(timer);
    },
  };
}
