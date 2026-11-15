/**
 * One writer for a planner result: the off-route watcher (#98) and the slope
 * detour button (#69) both update the same route fields and source tags.
 *
 * Plain JavaScript, no React and no three.js.
 */

export const PLANNED_ROUTE_SOURCES = Object.freeze({
  'route.path': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.distanceM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.climbM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.steepestSlopeDeg': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.etaSec': { tag: 'SIM', source: 'distance at 1 m/s (mobility.speed.flat)' },
});

/**
 * @param {{ getState: Function, setState: Function }} store
 * @param {{ ok: boolean, path?: Array<[number, number]>, distance?: number,
 *   climb?: number, steepestSlopeDeg?: number, detail?: string, reason?: string }} result
 * @param {{ reason: string, etaSec?: number | null, kind?: string | null }} options kind: what made this route ('slope'
 *   for the slope detour), stored as route.changeKind = { kind, path } with the path it belongs to. The reason is shown
 *   text and may be in the interface language; the EVA history (src/state/eva.js) classifies the change by this kind,
 *   and only while route.path is still that path, so a later route from another writer never inherits it.
 * @returns {boolean} true when the route was written
 */
export function applyPlannedRoute(store, result, { reason, etaSec = null, kind = null }) {
  if (!result?.ok) {
    store.setState((state) => ({
      route: {
        ...state.route,
        reason: result?.detail ?? result?.reason ?? `Re-plan failed: ${reason}`,
      },
    }));
    return false;
  }
  store.setState((state) => ({
    route: {
      ...state.route,
      path: result.path,
      distanceM: result.distance,
      climbM: result.climb,
      steepestSlopeDeg: result.steepestSlopeDeg,
      etaSec: etaSec ?? result.distance ?? null,
      reason,
      changeKind: kind ? { kind, path: result.path } : null,
      decision: 'pending',
      // route.skipped stays: a stop a hazard left out comes back only through Re-plan at the table (D12)
    },
    sources: { ...state.sources, ...PLANNED_ROUTE_SOURCES },
  }));
  return true;
}
