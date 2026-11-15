import { t, formatNumber } from '../i18n/index.js';
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
  if (minutes < 60) return t('ui.p0.min', { p0: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t('ui.p0.h.p1.min', { p0: hours, p1: rest }) : `${hours} h`;
}

/**
 * Numbers for the route panel. `null` means "not known yet" and is shown as a
 * dash, never as zero.
 * @param {{ distanceM: number | null, climbM: number | null,
 *   steepestSlopeDeg: number | null, etaSec: number | null }} route
 */
export function planSummary(route) {
  return {
    distance: Number.isFinite(route?.distanceM) ? t('ui.p0.km', { p0: formatNumber(route.distanceM / 1000, 2) }) : '—',
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
  'route.path': { tag: 'DERIVED', get source() { return t('ui.a.planner.hirise.dtm'); } },
  'route.distanceM': { tag: 'DERIVED', get source() { return t('ui.a.planner.hirise.dtm'); } },
  'route.climbM': { tag: 'DERIVED', get source() { return t('ui.a.planner.hirise.dtm'); } },
  'route.steepestSlopeDeg': { tag: 'DERIVED', get source() { return t('ui.a.planner.hirise.dtm'); } },
  'route.etaSec': { tag: 'DERIVED', get source() { return t('ui.suit.model.hazards.json.walking.speed'); } },
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
      key: 'distance', get label() { return t('ui.distance'); }, unit: 'km', path: 'route.distanceM',
      value: finite(route?.distanceM) ? formatNumber(route.distanceM / 1000, 2) : dash,
    },
    {
      key: 'climb', get label() { return t('ui.climb'); }, unit: 'm', path: 'route.climbM',
      value: finite(route?.climbM) ? `+${Math.round(route.climbM)}` : dash,
    },
    {
      key: 'steepest', get label() { return t('ui.steepest'); }, unit: '°', path: 'route.steepestSlopeDeg',
      value: finite(route?.steepestSlopeDeg) ? String(Math.round(route.steepestSlopeDeg)) : dash,
    },
    {
      key: 'time', get label() { return t('ui.walk.out'); }, unit: 'min', path: 'route.etaSec',
      value: finite(route?.etaSec) && route.etaSec > 0 ? String(Math.ceil(route.etaSec / 60)) : dash,
    },
    {
      key: 'o2', get label() { return t('ui.o2.out'); }, unit: 'g', path: 'route.totals.o2G',
      value: finite(totals?.o2G) ? String(Math.round(totals.o2G)) : dash,
      detail: finite(totals?.o2Pct) ? `${formatNumber(totals.o2Pct, 1)} %` : undefined,
    },
    {
      key: 'battery', get label() { return t('ui.battery.out'); }, unit: 'Wh', path: 'route.totals.batteryWh',
      value: finite(totals?.batteryWh) ? String(Math.round(totals.batteryWh)) : dash,
      detail: finite(totals?.batteryPct) ? `${formatNumber(totals.batteryPct, 1)} %` : undefined,
    },
  ];
}

/**
 * Fixed-point number for the cost table, or an en dash when unknown.
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
export function fixed(value, digits = 0) {
  return finite(value) ? formatNumber(value, digits) : '–';
}

/**
 * Minutes with one decimal from seconds, or an en dash when unknown.
 * @param {number | null | undefined} seconds
 */
export function minutesFixed(seconds) {
  return finite(seconds) ? formatNumber(seconds / 60, 1) : '–';
}
