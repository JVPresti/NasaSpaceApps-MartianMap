import { nextWaypointInfo } from './format.js';

/**
 * Selector for the next-waypoint panel (#20).
 *
 * `useShallow` compares the returned object one level deep, so every field has
 * to be a plain value or a reference that the store already owns. Building the
 * `{ x, z }` position here made every snapshot look new and re-rendered the HUD
 * until React unmounted the app (#153); `waypointPosition` builds it instead.
 */
export function selectWaypoint(state) {
  const info = nextWaypointInfo(state.route, state.navigation);
  if (!info) return null;
  return {
    name: info.shortName,
    full: info.name,
    range: Math.round(Number.isFinite(state.navigation.waypointRangeM) ? state.navigation.waypointRangeM : info.rangeM),
    brg: Math.round(Number.isFinite(state.navigation.waypointBearingDeg) ? state.navigation.waypointBearingDeg : info.bearingDeg),
    eta: Math.round(info.etaSec / 60),
    slope: state.navigation.slopeDeg,
    path: state.route.path,
    waypoints: state.route.waypoints,
    px: state.navigation.x,
    pz: state.navigation.z,
  };
}

/** The marker position, built in the component body and never inside a selector. */
export function waypointPosition(w) {
  if (!w || !Number.isFinite(w.px) || !Number.isFinite(w.pz)) return null;
  return { x: w.px, z: w.pz };
}
