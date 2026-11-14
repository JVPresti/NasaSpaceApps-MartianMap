/**
 * Waypoint arrival and next-target numbers (#61, fixes from the #139 review in #152).
 *
 * Runs in Walk mode, writes the distance and bearing to the current target into
 * `navigation`, and advances `route.nextIndex` when the astronaut enters the
 * arrival radius. The target is the event shelter while `route.shelter` is set,
 * else the next waypoint whose name is not in `route.skipped`. With no target
 * left the range and bearing are null and the route is complete.
 *
 * The arrival radius of a science stop comes from `arrival_radius` in
 * public/data/stops.json (2 m for both stops); every other waypoint uses 5 m.
 *
 * Plain JavaScript: no React, no three.js.
 */
import { stopForWaypoint } from '../data/stops.js';
import { bearingDeg } from './bearing.js';

export const WAYPOINT_TICK_MS = 200;
export const ARRIVAL_RADIUS_M = 5;

/** Written to `sources` with the first range and bearing. */
export const WAYPOINT_SOURCES = {
  'navigation.waypointRangeM': { tag: 'SIM', source: 'distance from the player position to the next waypoint or shelter' },
  'navigation.waypointBearingDeg': { tag: 'SIM', source: 'bearing from the player position to the next waypoint or shelter' },
};

/** Arrival radius in metres for a waypoint: the linked stop's `arrival_radius`, else 5 m. */
export function arrivalRadiusM(stops, waypoint) {
  return stopForWaypoint(stops ?? [], waypoint)?.arrival_radius.value ?? ARRIVAL_RADIUS_M;
}

const finite = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);

/**
 * What the astronaut walks to now.
 * @param {{ waypoints?: Array<{name?: string, x: number, z: number}>, nextIndex?: number,
 *   skipped?: string[], shelter?: {id?: string, name?: string, x: number, z: number} | null }} route
 * @returns {{ kind: 'shelter', index: null, name: string, x: number, z: number }
 *   | { kind: 'waypoint', index: number, name: string | undefined, x: number, z: number, waypoint: object }
 *   | { kind: 'complete', index: number }
 *   | null} null when there is no route at all
 */
export function nextTarget(route) {
  const shelter = route?.shelter;
  if (finite(shelter)) return { kind: 'shelter', index: null, name: shelter.name || shelter.id || 'Shelter', x: shelter.x, z: shelter.z };
  const waypoints = Array.isArray(route?.waypoints) ? route.waypoints : [];
  if (waypoints.length === 0) return null;
  const skipped = new Set(Array.isArray(route.skipped) ? route.skipped : []);
  let i = Number.isInteger(route.nextIndex) ? Math.max(0, route.nextIndex) : 0;
  while (i < waypoints.length && (!finite(waypoints[i]) || skipped.has(waypoints[i].name))) i += 1;
  if (i >= waypoints.length) return { kind: 'complete', index: waypoints.length };
  const waypoint = waypoints[i];
  return { kind: 'waypoint', index: i, name: waypoint.name, x: waypoint.x, z: waypoint.z, waypoint };
}

/**
 * @param {{ store: { getState: Function, setState: Function }, stops?: Array<object>,
 *   setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void, setStops: (stops: Array<object>) => void }}
 */
export function startWaypointRunner({ store, stops: initialStops = [], setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let stopped = false;
  let stops = initialStops;

  function tick() {
    if (stopped) return;
    const state = store.getState();
    if (state.mode !== 'walk') return;
    const nav = state.navigation;
    if (!finite(nav)) return;

    // Arrive at as many waypoints as the position is inside (stacked waypoints), then measure to what is left,
    // so the range written below always belongs to the target the HUD shows.
    let route = state.route ?? {};
    const reached = [];
    for (let guard = 0; guard <= (route.waypoints?.length ?? 0); guard += 1) {
      const target = nextTarget(route);
      if (target?.kind !== 'waypoint') break;
      if (Math.hypot(target.x - nav.x, target.z - nav.z) > arrivalRadiusM(stops, target.waypoint)) break;
      reached.push(target.name);
      route = { ...route, nextIndex: target.index + 1 };
    }
    if (reached.length > 0) {
      store.setState((current) => ({
        route: {
          ...current.route,
          nextIndex: route.nextIndex,
          visited: [...(Array.isArray(current.route?.visited) ? current.route.visited : []), ...reached],
        },
      }));
    }

    const target = nextTarget(route);
    const aim = target && target.kind !== 'complete';
    const rangeM = aim ? Math.hypot(target.x - nav.x, target.z - nav.z) : null;
    const bearing = aim ? bearingDeg(nav, target) : null;
    if (nav.waypointRangeM === rangeM && nav.waypointBearingDeg === bearing) return;
    store.setState((current) => ({
      navigation: { ...current.navigation, waypointRangeM: rangeM, waypointBearingDeg: bearing },
      ...(aim && !current.sources?.['navigation.waypointRangeM'] ? { sources: { ...current.sources, ...WAYPOINT_SOURCES } } : {}),
    }));
  }

  const timer = si(tick, WAYPOINT_TICK_MS);
  tick();
  return {
    tick,
    setStops: (list) => { stops = Array.isArray(list) ? list : []; },
    stop: () => {
      if (stopped) return;
      stopped = true;
      ci(timer);
    },
  };
}
