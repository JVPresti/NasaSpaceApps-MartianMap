/**
 * Pure helpers for the Plan route panel.
 *
 * Kept apart from React so the formatting and the "did the waypoints really
 * change?" rule can be tested without a browser.
 */

/**
 * Stable key for a waypoint list, so a re-render with equal values does not
 * start another planner request.
 * @param {Array<{ x: number, z: number, name?: string }>} waypoints
 * @returns {string}
 */
export function waypointKey(waypoints) {
  return (waypoints ?? [])
    .map((waypoint) => `${waypoint.name ?? ''}:${Math.round(waypoint.x)}:${Math.round(waypoint.z)}`)
    .join('|');
}

/**
 * Human-readable duration, rounded to the next minute.
 * @param {number | null} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Numbers for the route panel. `null` means "not known yet" and is shown as a
 * dash, never as zero.
 * @param {{ distanceM: number | null, climbM: number | null,
 *   steepestSlopeDeg: number | null, etaSec: number | null }} route
 */
export function planSummary(route) {
  return {
    distance: Number.isFinite(route?.distanceM) ? `${(route.distanceM / 1000).toFixed(2)} km` : '—',
    climb: Number.isFinite(route?.climbM) ? `+${Math.round(route.climbM)} m` : '—',
    steepest: Number.isFinite(route?.steepestSlopeDeg) ? `${Math.round(route.steepestSlopeDeg)}°` : '—',
    eta: formatDuration(route?.etaSec),
  };
}

/**
 * Source tags written to the store with a planned route. Every value shown on
 * the panel resolves to one of these.
 */
export const ROUTE_SOURCES = Object.freeze({
  'route.path': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.distanceM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.climbM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.steepestSlopeDeg': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.etaSec': { tag: 'DERIVED', source: 'suit model · hazards.json walking speed' },
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Summary tiles of the route panel: the planner's distance, climb, steepest
 * slope and walk time, then the oxygen and battery the walk out uses
 * (route.totals from src/sim/legCosts.js). Number and unit stay apart so the
 * panel can set the number in monospace and the unit in its own color.
 * `path` is the store path whose source tag the tile shows.
 * @param {{ distanceM?: number | null, climbM?: number | null, steepestSlopeDeg?: number | null,
 *   etaSec?: number | null, totals?: { o2G: number, o2Pct: number, batteryWh: number, batteryPct: number } | null }} route
 * @returns {Array<{ key: string, label: string, value: string, unit: string, detail?: string, path: string }>}
 */
export function routeMetrics(route) {
  const totals = route?.totals ?? null;
  const dash = '—';
  return [
    {
      key: 'distance', label: 'Distance', unit: 'km', path: 'route.distanceM',
      value: finite(route?.distanceM) ? (route.distanceM / 1000).toFixed(2) : dash,
    },
    {
      key: 'climb', label: 'Climb', unit: 'm', path: 'route.climbM',
      value: finite(route?.climbM) ? `+${Math.round(route.climbM)}` : dash,
    },
    {
      key: 'steepest', label: 'Steepest', unit: '°', path: 'route.steepestSlopeDeg',
      value: finite(route?.steepestSlopeDeg) ? String(Math.round(route.steepestSlopeDeg)) : dash,
    },
    {
      key: 'time', label: 'Walk out', unit: 'min', path: 'route.etaSec',
      value: finite(route?.etaSec) && route.etaSec > 0 ? String(Math.ceil(route.etaSec / 60)) : dash,
    },
    {
      key: 'o2', label: 'O2 out', unit: 'g', path: 'route.totals.o2G',
      value: finite(totals?.o2G) ? String(Math.round(totals.o2G)) : dash,
      detail: finite(totals?.o2Pct) ? `${totals.o2Pct.toFixed(1)} %` : undefined,
    },
    {
      key: 'battery', label: 'Battery out', unit: 'Wh', path: 'route.totals.batteryWh',
      value: finite(totals?.batteryWh) ? String(Math.round(totals.batteryWh)) : dash,
      detail: finite(totals?.batteryPct) ? `${totals.batteryPct.toFixed(1)} %` : undefined,
    },
  ];
}

/**
 * Fixed-point number for the cost table, or an en dash when unknown.
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
export function fixed(value, digits = 0) {
  return finite(value) ? value.toFixed(digits) : '–';
}

/**
 * Minutes with one decimal from seconds, or an en dash when unknown.
 * @param {number | null | undefined} seconds
 */
export function minutesFixed(seconds) {
  return finite(seconds) ? (seconds / 60).toFixed(1) : '–';
}
