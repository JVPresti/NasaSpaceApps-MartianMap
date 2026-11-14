/**
 * EVA statistics and the end-of-EVA snapshot (#43).
 *
 * The runner owns one small state slice, `eva`, and does three jobs:
 *
 *   1. Stats. It adds up the horizontal distance walked in Walk mode while the mission is running, and keeps the
 *      lowest `suit.marginSec` and `suit.batteryPct` seen. A null means "not known yet": a missing reading never
 *      becomes 0, and a minimum is never invented at the start.
 *   2. History. It records event start/end entries (written by the event runner through the event engine's log
 *      callback) and real route changes. A route change counts only when the path content is different: legs,
 *      totals, `nextIndex`, `visited` and a new array with the same points never add an entry.
 *   3. The end of the EVA. The astronaut must first be outside the habitat arrival area and then re-enter it, in
 *      Walk mode with the mission running. The mission clock is paused at that instant and the summary is stored,
 *      deeply frozen, so the debrief cannot change while the rest of the app keeps running.
 *
 * Phases:
 *   'ready'  no statistics yet: the start screen, Plan mode, a paused mission, or the astronaut still inside the HAB
 *   'active' the astronaut has left the HAB arrival area and is outside
 *   'ended'  the astronaut re-entered the arrival area; `summary` is final
 *
 * The habitat entry is the real one in `public/data/shelters.json` (the foot of the airlock steps at 535.1, 574.1),
 * never the `HAB` route waypoint at 520, 600. The same 5 m arrival radius as a normal waypoint applies.
 *
 * Plain JavaScript: no React, no three.js and no store import. The runner takes any store with
 * getState / setState / subscribe, as `src/state/store.js` provides.
 */

/** Arrival radius at the habitat, in metres. The same radius as a non-science waypoint (#61). */
export const HAB_ARRIVAL_RADIUS_M = 5;
/** How often the runner samples position, mission time and suit margins. */
export const EVA_TICK_MS = 200;

/** The `eva` store slice before the EVA starts. New arrays every call, so a reset cannot share them. */
export function createInitialEvaState() {
  return {
    phase: 'ready',
    startedAtSec: null,          // mission elapsed when the astronaut was first seen outside the HAB
    endedAtSec: null,            // mission elapsed when they re-entered the HAB; the clock is paused then
    distanceM: 0,
    minOxygenMarginSec: null,    // lowest suit.marginSec seen, seconds; null until a finite reading exists
    minBatteryPct: null,         // lowest suit.batteryPct seen, 0 to 100; null until a finite reading exists
    events: [],                  // [{ type: 'start' | 'end', eventId, label, atSec }]
    routeChanges: [],            // [{ atSec, kind, reason, before, after }], see routeSnapshot below
    summary: null,               // final frozen snapshot; null until phase 'ended'
  };
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPath = (path) => Array.isArray(path) && path.length > 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function evaOf(state) {
  return state?.eva ?? createInitialEvaState();
}

/** Mission time for a store reading. The clock publishes a finite, non-negative elapsed value. */
function missionTimeSec(state) {
  const elapsed = state?.mission?.elapsedSec;
  return isFiniteNumber(elapsed) && elapsed >= 0 ? elapsed : 0;
}

function distanceToHab(position, habitat) {
  return Math.hypot(position.x - habitat.x, position.z - habitat.z);
}

/** Deep freeze JSON-like data. Used only for the final summary. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function samePoint(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

/**
 * True when two route paths have the same points in the same order. References do not matter, so a planner or the
 * per-leg cost runner rewriting the same route does not look like a new route.
 * @param {Array<[number, number]> | null | undefined} a
 * @param {Array<[number, number]> | null | undefined} b
 */
export function samePath(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((point, index) => samePoint(point, b[index]));
}

/** A compact, detached route view for the change history. */
function routeSnapshot(route) {
  if (!route) return null;
  return {
    path: isPath(route.path) ? clone(route.path) : null,
    distanceM: isFiniteNumber(route.distanceM) ? route.distanceM : null,
    reason: typeof route.reason === 'string' ? route.reason : null,
    shelterId: route.shelter?.id ?? null,
    waypointCount: Array.isArray(route.waypoints) ? route.waypoints.length : 0,
  };
}

function activeAlerts(alerts) {
  return Object.values(alerts ?? {}).filter((alert) => alert && alert.active === true);
}

function reasonMentionsAlert(reason, alerts) {
  if (typeof reason !== 'string') return false;
  return activeAlerts(alerts).some((alert) => reason.includes(alert.text) || reason.includes('(' + alert.eventId + ')'));
}

/**
 * Classify a route change by its reason and the route it produced. The first real path is `initial`; later normal
 * re-plans are `replan`. `offroute`, `slope` and `event` follow the reason written by their runner or the shelter
 * set by the event re-planner.
 */
function routeChangeKind(reason, snapshot, hasInitialRoute, alerts) {
  const text = typeof reason === 'string' ? reason : '';
  if (/^Off route/i.test(text)) return 'offroute';
  if (/^Detour/i.test(text)) return 'slope';
  if (snapshot?.shelterId || reasonMentionsAlert(text, alerts)) return 'event';
  if (!hasInitialRoute) return 'initial';
  return 'replan';
}

function writeEva(store, patch) {
  store.setState((state) => {
    const current = evaOf(state);
    if (current.phase === 'ended') return {};
    return { eva: { ...current, ...patch } };
  });
}

function addRouteChange(store, entry) {
  store.setState((state) => {
    const current = evaOf(state);
    if (current.phase === 'ended') return {};
    const routeChanges = Array.isArray(current.routeChanges) ? current.routeChanges : [];
    return { eva: { ...current, routeChanges: [...routeChanges, entry] } };
  });
}

/**
 * Append one event-engine log entry to `eva.events`. The event runner calls this from its existing `log` callback,
 * so the EVA keeps the event start and end times in mission time. Calls are ignored after the EVA ended, which keeps
 * the history and the frozen summary final.
 *
 * @param {{ getState: Function, setState: Function }} store
 * @param {{ type: 'start' | 'end', eventId: string, missionTimeSec: number, label?: string }} entry
 * @returns {boolean} true when an entry was written
 */
export function recordEvaEvent(store, entry) {
  if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function') {
    throw new TypeError('recordEvaEvent: store must provide getState and setState');
  }
  if (!entry || (entry.type !== 'start' && entry.type !== 'end')) return false;
  if (typeof entry.eventId !== 'string' || entry.eventId === '') return false;
  const state = store.getState();
  const eva = evaOf(state);
  if (eva.phase === 'ended') return false;
  const atSec = isFiniteNumber(entry.missionTimeSec) ? Math.max(0, entry.missionTimeSec) : missionTimeSec(state);
  const record = {
    type: entry.type,
    eventId: entry.eventId,
    label: typeof entry.label === 'string' ? entry.label : null,
    atSec,
  };
  store.setState((current) => {
    const evaNow = evaOf(current);
    if (evaNow.phase === 'ended') return {};
    const events = Array.isArray(evaNow.events) ? evaNow.events : [];
    return { eva: { ...evaNow, events: [...events, record] } };
  });
  return true;
}

function lowest(current, reading) {
  if (!isFiniteNumber(reading)) return current;
  return current === null || reading < current ? reading : current;
}

function buildSummary(state, eva, endedAtSec) {
  const startedAtSec = isFiniteNumber(eva.startedAtSec) ? eva.startedAtSec : null;
  const sampling = state?.sampling ?? {};
  const environment = state?.environment ?? {};
  const samples = Array.isArray(sampling.samples) ? clone(sampling.samples) : [];
  return {
    startedAtSec,
    endedAtSec,
    elapsedOutsideSec: startedAtSec === null ? null : Math.max(0, endedAtSec - startedAtSec),
    distanceM: isFiniteNumber(eva.distanceM) ? eva.distanceM : 0,
    minOxygenMarginSec: isFiniteNumber(eva.minOxygenMarginSec) ? eva.minOxygenMarginSec : null,
    minBatteryPct: isFiniteNumber(eva.minBatteryPct) ? eva.minBatteryPct : null,
    events: clone(Array.isArray(eva.events) ? eva.events : []),
    routeChanges: clone(Array.isArray(eva.routeChanges) ? eva.routeChanges : []),
    sampleCount: Number.isInteger(sampling.count) ? sampling.count : samples.length,
    photos: Number.isInteger(sampling.photos) ? sampling.photos : 0,
    samples,
    // Current radiation values from the store. The radiation event is still the one that writes them; this module
    // only copies the reading at the end, it does not integrate dose itself.
    doseUgy: isFiniteNumber(environment.doseUgy) ? environment.doseUgy : null,
    doseRateUgyH: isFiniteNumber(environment.doseRateUgyH) ? environment.doseRateUgyH : null,
  };
}

/**
 * Start the EVA statistics runner.
 *
 * @param {{
 *   store: { getState: Function, setState: Function, subscribe: Function },
 *   habitat: { x: number, z: number },
 *   setInterval?: Function,
 *   clearInterval?: Function,
 *   tickMs?: number,
 * }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startEvaRunner({
  store,
  habitat,
  setInterval: si = setInterval,
  clearInterval: ci = clearInterval,
  tickMs = EVA_TICK_MS,
} = {}) {
  if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function' || typeof store.subscribe !== 'function') {
    throw new TypeError('startEvaRunner: store must provide getState, setState and subscribe');
  }
  if (!habitat || !isFiniteNumber(habitat.x) || !isFiniteNumber(habitat.z)) {
    throw new TypeError('startEvaRunner: habitat needs finite x and z');
  }

  let stopped = false;
  let ending = false;
  let lastPosition = null;
  let lastRoute = null;
  let hasInitialRoute = false;

  // The initial route may already exist when the real HAB finally loads (the EVA runner starts after that fetch).
  // Capture it once, so a later re-plan still has a before/after pair.
  const initialState = store.getState();
  const initialEva = evaOf(initialState);
  if (initialEva.phase !== 'ended' && isPath(initialState.route?.path)) {
    lastRoute = routeSnapshot(initialState.route);
    hasInitialRoute = true;
    addRouteChange(store, {
      atSec: missionTimeSec(initialState),
      kind: routeChangeKind(lastRoute.reason, lastRoute, false, initialState.alerts),
      reason: lastRoute.reason,
      before: null,
      after: lastRoute,
    });
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.mode !== previous.mode || state.mission?.paused !== previous.mission?.paused) lastPosition = null;
    if (stopped || evaOf(state).phase === 'ended' || state.route === previous.route) return;
    const next = routeSnapshot(state.route);
    const nextHasPath = isPath(next?.path);
    if (!nextHasPath && lastRoute === null) return;                        // still no route: nothing changed
    if (lastRoute !== null && samePath(lastRoute.path, next?.path)) {      // same points: only metadata moved
      lastRoute = nextHasPath ? next : lastRoute;
      return;
    }

    const kind = routeChangeKind(next?.reason, next, hasInitialRoute, state.alerts);
    const entry = {
      atSec: missionTimeSec(state),
      kind,
      reason: nextHasPath ? next.reason : (next?.reason ?? null),
      before: lastRoute,
      after: nextHasPath ? next : null,
    };
    // Update the baseline before writing: the write below notifies this subscriber again, and the new path must
    // already look like the current one or it would be recorded twice.
    lastRoute = nextHasPath ? next : null;
    if (nextHasPath) hasInitialRoute = true;
    addRouteChange(store, entry);
  });

  function endEva(overrides) {
    if (ending) return;
    ending = true;

    // This is the same write as setMissionPaused(true) in store.js: the #59 clock anchors its elapsed value at
    // this exact instant, so the summary and the frozen mission clock agree.
    const beforePause = store.getState();
    if (beforePause.mission?.paused !== true) {
      store.setState((state) => ({ mission: { ...state.mission, paused: true } }));
    }

    const finalState = store.getState();
    const finalEva = evaOf(finalState);
    const startedAtSec = isFiniteNumber(finalEva.startedAtSec) ? finalEva.startedAtSec : null;
    const endedAtSec = Math.max(startedAtSec ?? 0, missionTimeSec(finalState));
    const summary = deepFreeze(buildSummary(finalState, { ...finalEva, ...overrides }, endedAtSec));

    store.setState((state) => {
      const current = evaOf(state);
      return {
        eva: {
          ...current,
          ...overrides,
          phase: 'ended',
          endedAtSec,
          summary,
        },
      };
    });
  }

  function tick() {
    if (stopped || ending) return;
    const state = store.getState();
    const eva = evaOf(state);
    if (eva.phase === 'ended') return;

    const nav = state.navigation;
    if (!isFiniteNumber(nav?.x) || !isFiniteNumber(nav?.z)) {
      lastPosition = null;
      return;
    }

    // No distance while paused or in Plan. Clearing the baseline also means a mode switch, a resume or a teleport
    // cannot add one large jump on the next Walk tick.
    if (state.mode !== 'walk' || state.mission?.paused === true) {
      lastPosition = null;
      return;
    }

    const inside = distanceToHab(nav, habitat) <= HAB_ARRIVAL_RADIUS_M;

    if (eva.phase === 'ready') {
      // Starting inside the HAB (a future start screen) is not an EVA: wait until the astronaut has left.
      if (inside) {
        lastPosition = null;
        return;
      }
      lastPosition = { x: nav.x, z: nav.z };
      const patch = { phase: 'active', startedAtSec: missionTimeSec(state) };
      const minOxygen = lowest(null, state.suit?.marginSec);
      const minBattery = lowest(null, state.suit?.batteryPct);
      if (minOxygen !== null) patch.minOxygenMarginSec = minOxygen;
      if (minBattery !== null) patch.minBatteryPct = minBattery;
      writeEva(store, patch);
      return;
    }

    let distanceM = eva.distanceM;
    if (lastPosition) {
      const step = Math.hypot(nav.x - lastPosition.x, nav.z - lastPosition.z);
      if (isFiniteNumber(step) && step > 0) distanceM += step;
    }
    lastPosition = { x: nav.x, z: nav.z };

    const minOxygen = lowest(eva.minOxygenMarginSec, state.suit?.marginSec);
    const minBattery = lowest(eva.minBatteryPct, state.suit?.batteryPct);

    if (inside) {
      // Count the last step into the airlock and the current margins before freezing the summary.
      endEva({ distanceM, minOxygenMarginSec: minOxygen, minBatteryPct: minBattery });
      return;
    }

    const patch = {};
    if (distanceM !== eva.distanceM) patch.distanceM = distanceM;
    if (minOxygen !== eva.minOxygenMarginSec) patch.minOxygenMarginSec = minOxygen;
    if (minBattery !== eva.minBatteryPct) patch.minBatteryPct = minBattery;
    if (Object.keys(patch).length > 0) writeEva(store, patch);
  }

  const timer = si(tick, tickMs);
  tick();

  return {
    tick,
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      ci(timer);
    },
  };
}
