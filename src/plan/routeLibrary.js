/**
 * Saved routes (#357): the crew keeps a planned route under a name, loads it back at the mission table, and every
 * saved route carries its own success record — how many EVAs departed on it, how many reached every waypoint, the
 * samples it brought back, the distance walked and the last run. Risk is the route's own terrain: the steepest
 * grade and the climb, banded with the planner's slope limits (costGrid.js: under 15° low, 15 to 20° caution,
 * at or over 20° high).
 *
 * Persistence follows src/engine/lookSettings.js: one JSON blob in localStorage, read once at load; a missing,
 * blocked or corrupt entry leaves an empty library and never throws. Plain JavaScript, no React, no three.js.
 *
 * A route saved from a "Collect samples" plan (#352) also keeps its sampling tasks (route.tasks) and what each task
 * place serves, so loading it back can put the same tasks on the table (savedRouteTasks).
 */
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { checkTasks } from '../sim/sampleTasks.js';

export const ROUTE_LIBRARY_KEY = 'marswalk.routes';
export const MAX_SAVED_ROUTES = 8;

export const RISK_LEVELS = Object.freeze({ low: 'low', caution: 'caution', high: 'high' });

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Risk band of a steepest grade: the same limits the planner and the slope layer use (costGrid.js, hazards.json). */
export function riskLevel(maxSlopeDeg) {
  if (!finite(maxSlopeDeg)) return null;
  if (maxSlopeDeg >= COST_CONSTANTS.SLOPE_LIMIT_DEG) return RISK_LEVELS.high;
  if (maxSlopeDeg >= COST_CONSTANTS.SLOPE_CAUTION_DEG) return RISK_LEVELS.caution;
  return RISK_LEVELS.low;
}

/** The risk numbers of a planned route, from the planner's own metrics. */
export function routeRisk(route) {
  return {
    maxSlopeDeg: finite(route?.steepestSlopeDeg) ? route.steepestSlopeDeg : null,
    climbM: finite(route?.climbM) ? route.climbM : null,
    level: riskLevel(route?.steepestSlopeDeg),
  };
}

/**
 * A stable identity for a route's waypoint list (names plus metre-rounded coordinates), so a saved route can be
 * matched to the route an EVA actually departed on. Null without waypoints.
 */
export function routeSignature(route) {
  const waypoints = route?.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length === 0) return null;
  return waypoints
    .map((w) => (w && typeof w.name === 'string' ? w.name : '?') + '@' + Math.round(finite(w?.x) ? w.x : 0) + ',' + Math.round(finite(w?.z) ? w.z : 0))
    .join('|');
}

/** A plain copy of one waypoint, keeping the work at the stop (src/sim/legCosts.js) and its stops.json id. */
function copyWaypoint(w) {
  const point = { name: typeof w.name === 'string' ? w.name : 'WP', x: w.x, z: w.z };
  if (finite(w.workSec)) point.workSec = w.workSec;
  if (typeof w.stopId === 'string') point.stopId = w.stopId;
  if (w.required === true) point.required = true;
  // a sampling task's place (#352, only these waypoints have `place`): its name, the tasks it serves and its arrival
  // radius, so a loaded route still names its tasks and arrives at a clicked point as the plan did
  if (typeof w.place === 'string') {
    point.place = w.place;
    if (typeof w.label === 'string') point.label = w.label;
    if (Array.isArray(w.tasks)) point.tasks = w.tasks.filter((id) => typeof id === 'string');
    if (finite(w.arrivalRadiusM)) point.arrivalRadiusM = w.arrivalRadiusM;
  }
  return point;
}

/** A sampling task's place in the crew's list, from the place the plan resolved it to (sampleTasks.resolvePlace). */
function taskPlaceOf(place) {
  if (place?.type === 'point') return { type: 'point', id: place.key, x: place.x, z: place.z };
  return { type: 'stop', stopId: place?.stopId ?? place?.key };
}

/**
 * The sampling tasks a saved route carries (#352): `plan`, a copy of the plan's tasks as route.tasks holds them (kept and
 * left out, with their places), and `list`, the crew's task list they were planned from, rebuilt from each task's
 * place (needs.tasks). Both empty for a route saved without tasks, or one whose tasks no longer read as a task list.
 * @param {object | null} entry a saved route
 * @returns {{ plan: Array<object>, list: Array<object> }}
 */
export function savedRouteTasks(entry) {
  const plan = Array.isArray(entry?.tasks) ? entry.tasks : [];
  if (plan.length === 0) return { plan: [], list: [] };
  try {
    const list = checkTasks(plan.map((task) => ({ id: task?.id, what: task?.what, count: task?.count, place: taskPlaceOf(task?.place) })));
    return { plan: JSON.parse(JSON.stringify(plan)), list };
  } catch {
    return { plan: [], list: [] };
  }
}

/**
 * Add a saved route to the list (newest first, at most MAX_SAVED_ROUTES). Returns the same list reference when the
 * save cannot be made: no name, no waypoints or no planned path.
 * @param {Array<object> | null} list
 * @param {{ name: string, route: object, nowMs?: number }} input
 * @returns {Array<object>}
 */
export function saveRoute(list, { name, route, nowMs = Date.now() }) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return list;
  if (!Array.isArray(route?.waypoints) || route.waypoints.length === 0) return list;
  if (!Array.isArray(route?.path) || route.path.length < 2) return list;
  const entry = {
    id: 'route-' + nowMs.toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    name: clean,
    savedAtMs: nowMs,
    waypoints: route.waypoints.map(copyWaypoint),
    path: route.path.map((point) => [point[0], point[1]]),
    distanceM: finite(route.distanceM) ? route.distanceM : null,
    climbM: finite(route.climbM) ? route.climbM : null,
    risk: routeRisk(route),
    record: { attempts: 0, completed: 0, samples: 0, distanceM: 0, doseUgy: null, lastRunAtMs: null },
  };
  // a "Collect samples" plan's tasks (#352); the other goals' routes have none and save as before
  if (Array.isArray(route.tasks) && route.tasks.length > 0) entry.tasks = JSON.parse(JSON.stringify(route.tasks));
  return [entry, ...(Array.isArray(list) ? list : [])].slice(0, MAX_SAVED_ROUTES);
}

/** Drop one saved route. Returns the same list reference when it was not there. */
export function deleteRoute(list, id) {
  if (!Array.isArray(list) || typeof id !== 'string') return list;
  const next = list.filter((entry) => entry.id !== id);
  return next.length === list.length ? list : next;
}

function validPoint(p) {
  return Array.isArray(p) && finite(p[0]) && finite(p[1]);
}

function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string' || entry.id === '' || typeof entry.name !== 'string' || entry.name === '') return false;
  if (!Array.isArray(entry.waypoints) || entry.waypoints.length === 0) return false;
  if (!entry.waypoints.every((w) => w && typeof w.name === 'string' && finite(w.x) && finite(w.z))) return false;
  if (!Array.isArray(entry.path) || entry.path.length < 2 || !entry.path.every(validPoint)) return false;
  return true;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the saved routes. A missing, blocked, malformed or partially corrupt entry never throws: malformed entries
 * are dropped and the list is capped at MAX_SAVED_ROUTES.
 * @param {{ getItem?: (key: string) => string | null } | null} [storage]
 * @returns {Array<object>}
 */
export function readRouteLibrary(storage = defaultStorage()) {
  let raw = null;
  try {
    raw = storage ? storage.getItem(ROUTE_LIBRARY_KEY) : null;
  } catch {
    return [];
  }
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(validEntry).slice(0, MAX_SAVED_ROUTES);
}

/** Persist the saved routes. Never throws; returns false when the storage refused the write. */
export function writeRouteLibrary(list, storage = defaultStorage()) {
  try {
    if (storage) storage.setItem(ROUTE_LIBRARY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record one finished EVA against the saved route it departed on: attempts and completions go up, and the samples,
 * distance and dose of the run are added to the record. No saved route matches the signature: nothing happens.
 * @param {{ getState: Function, setState: Function }} store
 * @param {string | null} signature the signature of the route the EVA departed on (captured at EVA start)
 * @param {{ sampleCount?: number, distanceM?: number, doseUgy?: number | null }} summary the EVA's frozen summary
 * @param {{ completed?: boolean, nowMs?: number }} [options] completed: every waypoint was reached this run
 * @returns {boolean} true when a saved route's record was updated
 */
export function recordRouteRun(store, signature, summary, { completed = false, nowMs = Date.now() } = {}) {
  if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function') return false;
  if (typeof signature !== 'string' || !summary || typeof summary !== 'object') return false;
  const state = store.getState();
  const list = state.routeLibrary?.list;
  if (!Array.isArray(list) || list.length === 0) return false;
  const index = list.findIndex((entry) => routeSignature({ waypoints: entry.waypoints }) === signature);
  if (index < 0) return false;
  const next = list.map((entry, i) => {
    if (i !== index) return entry;
    const record = entry.record ?? {};
    const samples = Number.isInteger(summary.sampleCount) && summary.sampleCount > 0 ? summary.sampleCount : 0;
    const distanceM = finite(summary.distanceM) && summary.distanceM > 0 ? summary.distanceM : 0;
    return {
      ...entry,
      record: {
        attempts: (record.attempts ?? 0) + 1,
        completed: (record.completed ?? 0) + (completed ? 1 : 0),
        samples: (record.samples ?? 0) + samples,
        distanceM: (record.distanceM ?? 0) + distanceM,
        doseUgy: finite(summary.doseUgy) ? summary.doseUgy : (record.doseUgy ?? null),
        lastRunAtMs: nowMs,
      },
    };
  });
  store.setState((s) => ({ routeLibrary: { ...(s.routeLibrary ?? { list: [] }), list: next } }));
  writeRouteLibrary(next);
  return true;
}
