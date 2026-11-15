// Pure formatting for the EVA debrief (#43). No React, no three.js and no store import: the screen formats the
// frozen `eva.summary` only. Every helper returns a dash for a value that was not known when the EVA ended.

const DASH = '—';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const pad2 = (value) => String(value).padStart(2, '0');

/** Horizontal distance: metres below one kilometre, kilometres with two decimals above it. */
export function formatDistance(m) {
  if (!isNumber(m) || m < 0) return DASH;
  const rounded = Math.round(m);
  return rounded < 1000 ? rounded + ' m' : (m / 1000).toFixed(2) + ' km';
}

/** Mission elapsed seconds in the log: 'T+1:02:05'. */
export function formatMissionTime(sec) {
  if (!isNumber(sec) || sec < 0) return DASH;
  const total = Math.floor(sec);
  return 'T+' + Math.floor(total / 3600) + ':' + pad2(Math.floor((total % 3600) / 60)) + ':' + pad2(total % 60);
}

/** Time outside the habitat: '45 s', '12 min 30 s', '1 h 12 min'. */
export function formatDuration(sec) {
  if (!isNumber(sec) || sec < 0) return DASH;
  const total = Math.round(sec);
  if (total < 60) return total + ' s';
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const seconds = total % 60;
    return seconds ? minutes + ' min ' + seconds + ' s' : minutes + ' min';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + ' h' + (rest ? ' ' + rest + ' min' : '');
}

/** A signed oxygen margin in whole minutes: '+42 min', '-3 min', '0 min'. Unknown values are a dash. */
export function formatSignedMinutes(sec) {
  if (!isNumber(sec)) return DASH;
  const minutes = Math.round(Math.abs(sec) / 60);
  if (minutes === 0) return '0 min';
  return (sec > 0 ? '+' : '-') + minutes + ' min';
}

/** Whole battery per cent. The store uses null until a reading exists. */
export function formatPercent(pct) {
  if (!isNumber(pct)) return DASH;
  return Math.round(pct) + ' %';
}

/** Radiation dose in microgray. The store uses null until the radiation event writes a reading. */
export function formatDose(ugy) {
  if (!isNumber(ugy)) return DASH;
  const abs = Math.abs(ugy);
  if (abs > 0 && abs < 0.01) return '<0.01 µGy';
  return (abs < 10 ? ugy.toFixed(2) : ugy.toFixed(1)) + ' µGy';
}

/** '1 sample' or '4 samples'. */
export function formatSamples(count) {
  if (!Number.isInteger(count) || count < 0) return DASH;
  return count + (count === 1 ? ' sample' : ' samples');
}

const ROUTE_KINDS = Object.freeze({
  initial: 'Initial route',
  replan: 'Route re-planned',
  offroute: 'Off-route recovery',
  slope: 'Slope detour',
  event: 'Hazard re-route',
});

/** A readable name for the route change kind the EVA runner classified. */
export function routeKindLabel(kind) {
  return ROUTE_KINDS[kind] ?? 'Route updated';
}

/** '412 m → 388 m' from the before/after snapshots, or null when neither distance is known. */
export function routeDistanceChange(change) {
  const before = isNumber(change?.before?.distanceM) ? formatDistance(change.before.distanceM) : null;
  const after = isNumber(change?.after?.distanceM) ? formatDistance(change.after.distanceM) : null;
  if (before === null && after === null) return null;
  return (before ?? DASH) + ' → ' + (after ?? DASH);
}

/**
 * One chronological mission log from the frozen summary: every event start/end and every route change, ordered
 * by mission time. The source entries keep their own shape; `type` and `order` decide how the screen draws them.
 *
 * @param {{ events?: Array<object>, routeChanges?: Array<object> } | null} summary
 * @returns {Array<{ type: 'event' | 'route', atSec: number | null, order: number, event?: object, change?: object }>}
 */
export function buildMissionLog(summary) {
  const events = Array.isArray(summary?.events) ? summary.events : [];
  const changes = Array.isArray(summary?.routeChanges) ? summary.routeChanges : [];
  const entries = [
    ...events.map((event, index) => ({
      type: 'event',
      atSec: isNumber(event?.atSec) ? event.atSec : null,
      order: index,
      event,
    })),
    ...changes.map((change, index) => ({
      type: 'route',
      atSec: isNumber(change?.atSec) ? change.atSec : null,
      order: events.length + index,
      change,
    })),
  ];
  // Unknown times go last. The order field keeps the original summary order for two entries at the same second.
  return entries.sort((a, b) => (a.atSec ?? Infinity) - (b.atSec ?? Infinity) || a.order - b.order);
}
