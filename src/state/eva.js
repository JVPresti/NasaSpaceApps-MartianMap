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
 *   3. The end of the EVA (#244). Being back at the habitat never ends it by itself: while the astronaut is at the
 *      habitat during the EVA, `eva.atHabitat` is true and the interface offers to end it (a prompt over the planning
 *      table, src/state/tableActions.js). requestEvaEnd() then ends it on the next tick: the mission clock is paused at
 *      that instant and the summary is stored, deeply frozen, so the debrief cannot change while the rest of the app
 *      keeps running. continueEva() goes back to the EVA from the debrief; the statistics keep counting.
 *   4. The route review inputs (#274). `track` keeps a point every TRACK_STEP_M of horizontal walking (position,
 *      mission time, suit margin and O2, slope under the feet, the event running, at the habitat or not); `plan` is a
 *      copy of the route when the runner starts, which is Begin EVA, right after the go decision (route.path changes
 *      during the EVA, so the review needs this copy); `finds` keeps every marked find with the time it was marked,
 *      because reached finds leave `finds.list`. All three are frozen into the summary and survive continueEva().
 *      The review itself is src/sim/routeReview.js.
 *
 * Phases:
 *   'ready'  no statistics yet: the start screen, Plan mode or a paused mission, before the first Walk tick
 *   'active' from the first Walk tick with the mission running, wherever the astronaut stands; being at the habitat
 *            (atHabitat) does not end it
 *   'ended'  the astronaut ended the EVA at the habitat; `summary` is final until continueEva()
 *
 * "At the habitat" is the 5 m arrival circle around the real HAB entry in `public/data/shelters.json` (the foot of the
 * airlock steps at 535.1, 574.1, never the `HAB` route waypoint at 520, 600), or any of the habitat's walk zones (the
 * steps, porch, airlock and cabin, from the engine). The cabin is about 10 m from the foot of the steps, so the circle
 * alone counted the cabin as outside. Without the HAB entry (shelters.json did not load, `habitat: null`) only the walk
 * zones count, so the EVA can still be ended from the cabin.
 *
 * Plain JavaScript: no React, no three.js and no store import. The runner takes any store with
 * getState / setState / subscribe, as `src/state/store.js` provides.
 */
import { truePosition } from '../sim/navigation.js';

/** Arrival radius at the habitat, in metres. The same radius as a non-science waypoint (#61). */
export const HAB_ARRIVAL_RADIUS_M = 5;
/** How often the runner samples position, mission time and suit margins. */
export const EVA_TICK_MS = 200;
/** Horizontal walking between two points of the recorded track (#274), in metres: about 700 points for a 1.4 km EVA. */
export const TRACK_STEP_M = 2;

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
    routeChanges: [],            // [{ atSec, kind, reason, before, after, x, z }], see routeSnapshot below; x, z: where it happened
    track: [],                   // [{ x, z, atSec, marginSec, slopeDeg, eventId, o2G, home }] every TRACK_STEP_M walked (#274)
    lowPoint: null,              // a track point at the reading of minOxygenMarginSec; the summary's track includes it
    plan: null,                  // the approved route at Begin EVA: { atSec, decision, profile, path, waypoints, legs, totals } (#274)
    finds: [],                   // [{ id, label, x, z, atSec, accepted, verdict }] every find marked this EVA (#274)
    summary: null,               // final frozen snapshot; null until phase 'ended'
    atHabitat: false,            // during the EVA: the astronaut is back at the habitat, where the EVA can be ended (#244)
    endRequested: false,         // the astronaut asked to end the EVA; the runner ends it on its next tick
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
    // The kind its writer gave this path (src/sim/routeUpdate.js), only while the path is still the one it was given
    // for: the reason is shown text, in the interface language, so the kind must not be read from it (B2).
    changeKind: route.changeKind && route.changeKind.path === route.path && typeof route.changeKind.kind === 'string' ? route.changeKind.kind : null,
  };
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
const roundedOrNull = (value, digits) => (isFiniteNumber(value) ? round(value, digits) : null);
// timeSec and o2G are walking plus the work at the stop a leg reaches (#247); walkSec and workO2G keep the walking
// apart, which is what the review prices a detour against.
const LEG_KEYS = ['distanceM', 'timeSec', 'o2G', 'walkSec', 'workSec', 'workO2G', 'climbM', 'maxSlopeDeg'];
const TOTAL_KEYS = ['distanceM', 'timeSec', 'o2G', 'walkSec', 'workSec', 'workO2G', 'marginSec'];
const pickNumbers = (source, keys) => Object.fromEntries(keys.map((key) => [key, isFiniteNumber(source?.[key]) ? source[key] : null]));

/**
 * The approved plan for the route review (#274): a detached copy of the route path, its waypoints and its per-leg
 * costs (src/sim/legCosts.js). null without a path.
 */
function planSnapshot(route, atSec) {
  if (!route || !isPath(route.path)) return null;
  return {
    atSec,
    decision: typeof route.decision === 'string' ? route.decision : null,
    profile: typeof route.profile === 'string' ? route.profile : null,
    path: clone(route.path),
    // label: the planned stop's own name ("Light-toned patch", src/sim/missionNeeds.js), for the debrief's samples note
    waypoints: (Array.isArray(route.waypoints) ? route.waypoints : [])
      .filter((w) => isFiniteNumber(w?.x) && isFiniteNumber(w?.z))
      .map((w) => ({ name: typeof w.name === 'string' ? w.name : null, label: typeof w.label === 'string' ? w.label : null, x: w.x, z: w.z })),
    legs: (Array.isArray(route.legs) ? route.legs : []).map((leg) => ({ from: leg?.from ?? null, to: leg?.to ?? null, ...pickNumbers(leg, LEG_KEYS) })),
    totals: route.totals ? pickNumbers(route.totals, TOTAL_KEYS) : null,
  };
}

/**
 * Keep the approved plan: the first route with a path the runner sees, which is the route of the go decision because
 * the runner starts at Begin EVA. Per-leg costs that arrive after the path (same path, legs filled later) are added.
 */
function keepPlan(store) {
  const state = store.getState();
  const eva = evaOf(state);
  const route = state.route;
  if (eva.phase === 'ended' || !isPath(route?.path)) return;
  let plan = null;
  if (!eva.plan) {
    plan = planSnapshot(route, missionTimeSec(state));
  } else if (eva.plan.legs?.length === 0 && Array.isArray(route.legs) && route.legs.length > 0 && samePath(eva.plan.path, route.path)) {
    const fresh = planSnapshot(route, eva.plan.atSec);
    plan = { ...eva.plan, legs: fresh.legs, totals: fresh.totals };
  }
  if (plan) store.setState((s) => ({ eva: { ...evaOf(s), plan } }));
}

/**
 * Keep every find marked this EVA with the mission time it was first seen, whether it was added to the route and the
 * verdict its card read when it was added ('go' | 'no-go' | 'unknown', the priced detour, src/state/finds.js). The
 * review lets an alert that starts on the way to a find added on a GO card pass (#274, D7).
 * finds.list drops a find once it is reached (pruneFinds), so the review could not see it at the end otherwise.
 */
function recordFinds(store) {
  const state = store.getState();
  const eva = evaOf(state);
  if (eva.phase === 'ended') return;
  const next = Array.isArray(eva.finds) ? [...eva.finds] : [];
  let changed = false;
  for (const find of Array.isArray(state.finds?.list) ? state.finds.list : []) {
    if (typeof find?.id !== 'string' || !isFiniteNumber(find.x) || !isFiniteNumber(find.z)) continue;
    const accepted = find.status === 'accepted';
    const verdict = accepted && typeof find.detour?.verdict === 'string' ? find.detour.verdict : null;
    const index = next.findIndex((f) => f.id === find.id);
    if (index < 0) {
      next.push({ id: find.id, label: typeof find.label === 'string' ? find.label : null, x: find.x, z: find.z, atSec: missionTimeSec(state), accepted, verdict });
      changed = true;
    } else if (accepted && !next[index].accepted) {
      next[index] = { ...next[index], accepted: true, verdict };
      changed = true;
    }
  }
  if (changed) store.setState((s) => ({ eva: { ...evaOf(s), finds: next } }));
}

/** The event-engine event running now, from this EVA's start and end entries: the latest one started and not ended. */
function activeEventId(events) {
  const running = [];
  for (const entry of Array.isArray(events) ? events : []) {
    const index = running.indexOf(entry?.eventId);
    if (index >= 0) running.splice(index, 1);
    if (entry?.type === 'start' && typeof entry.eventId === 'string') running.push(entry.eventId);
  }
  return running.at(-1) ?? null;
}

/**
 * One point of the walked track (#274). The slope is the terrain under the feet: the injected slopeAt (the cost grid's
 * 2 m central difference) or else navigation.slopeDeg, which the engine bridge computes the same way at the same point.
 */
function trackPoint(state, truth, eva, inside, slopeAt) {
  const slope = typeof slopeAt === 'function' ? slopeAt(truth.x, truth.z) : state.navigation?.slopeDeg;
  return {
    x: round(truth.x, 2),
    z: round(truth.z, 2),
    atSec: round(missionTimeSec(state), 1),
    marginSec: roundedOrNull(state.suit?.marginSec, 0),
    slopeDeg: roundedOrNull(slope, 1),
    eventId: activeEventId(eva.events),
    o2G: roundedOrNull(state.suit?.oxygenG, 1),
    home: inside === true,
  };
}

/** The track with one more point, unless it stands where the last one does. */
function withPoint(track, point) {
  const list = Array.isArray(track) ? track : [];
  const last = list.at(-1);
  return last && last.x === point.x && last.z === point.z ? list : [...list, point];
}

/** Where the astronaut stands, rounded like the track, or nulls. */
function positionOf(state) {
  const truth = truePosition(state?.navigation);
  return isFiniteNumber(truth.x) && isFiniteNumber(truth.z) ? { x: round(truth.x, 2), z: round(truth.z, 2) } : { x: null, z: null };
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
 * re-plans are `replan`. A kind the writer stored with the path (the slope detour, whose reason is translated) comes
 * first; `offroute`, `slope` and `event` otherwise follow the reason written by their runner (English constants) or the
 * shelter set by the event re-planner.
 */
function routeChangeKind(reason, snapshot, hasInitialRoute, alerts) {
  if (['offroute', 'slope', 'event'].includes(snapshot?.changeKind)) return snapshot.changeKind;
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

/**
 * The track with the point of the lowest margin in its place by mission time, unless it is already there. The track
 * keeps a point every 2 m of walking; the lowest margin is read every tick, often while standing still.
 */
function withLowPoint(track, lowPoint) {
  const list = Array.isArray(track) ? track : [];
  if (!lowPoint || !isFiniteNumber(lowPoint.atSec)) return list;
  if (list.some((p) => p.atSec === lowPoint.atSec && p.x === lowPoint.x && p.z === lowPoint.z)) return list;
  const index = list.findIndex((p) => isFiniteNumber(p.atSec) && p.atSec > lowPoint.atSec);
  return index < 0 ? [...list, lowPoint] : [...list.slice(0, index), lowPoint, ...list.slice(index)];
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
    // The route review inputs (#274): the walked track (with the point of the lowest margin, so the debrief's chart and
    // its headline agree), the plan approved at Begin EVA and every marked find.
    track: clone(withLowPoint(eva.track, eva.lowPoint)),
    plan: eva.plan ? clone(eva.plan) : null,
    finds: clone(Array.isArray(eva.finds) ? eva.finds : []),
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
 * Ask to end the EVA (#244). Only while it is active and the astronaut is at the habitat; the runner ends it on its
 * next tick. @returns {boolean} true when the request was written
 */
export function requestEvaEnd(store) {
  const eva = evaOf(store.getState());
  if (eva.phase !== 'active' || !eva.atHabitat || eva.endRequested) return false;
  store.setState((state) => ({ eva: { ...evaOf(state), endRequested: true } }));
  return true;
}

/**
 * Back to the EVA from the debrief (#244): drops the summary and keeps the statistics, so they go on counting. The
 * mission clock stays paused until the interface resumes it (evaSession.js resumeEva). @returns {boolean}
 */
export function continueEva(store) {
  const eva = evaOf(store.getState());
  if (eva.phase !== 'ended') return false;
  store.setState((state) => ({ eva: { ...evaOf(state), phase: 'active', endedAtSec: null, summary: null, endRequested: false } }));
  return true;
}

/**
 * Start the EVA statistics runner.
 *
 * @param {{
 *   store: { getState: Function, setState: Function, subscribe: Function },
 *   habitat: { x: number, z: number } | null,   the real HAB entry; null when shelters.json did not load (walk zones only)
 *   habitatZoneAt?: (x: number, z: number) => string | null,   the habitat walk zone at a point (engine.habitatZoneAt)
 *   slopeAt?: ((x: number, z: number) => number) | null,   terrain slope in degrees for the track; default navigation.slopeDeg
 *   setInterval?: Function,
 *   clearInterval?: Function,
 *   tickMs?: number,
 * }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startEvaRunner({
  store,
  habitat,
  habitatZoneAt = () => null,
  slopeAt = null,
  setInterval: si = setInterval,
  clearInterval: ci = clearInterval,
  tickMs = EVA_TICK_MS,
} = {}) {
  if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function' || typeof store.subscribe !== 'function') {
    throw new TypeError('startEvaRunner: store must provide getState, setState and subscribe');
  }
  if (habitat !== null && (!habitat || !isFiniteNumber(habitat.x) || !isFiniteNumber(habitat.z))) {
    throw new TypeError('startEvaRunner: habitat needs finite x and z, or null');
  }

  let stopped = false;
  let ending = false;
  let lastPosition = null;
  let lastRoute = null;
  let hasInitialRoute = false;
  let sinceTrackM = 0;   // horizontal walking since the last track point

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
      ...positionOf(initialState),
    });
  }
  // The runner starts at Begin EVA, so this is the route the crew said go to (#274).
  keepPlan(store);
  recordFinds(store);

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.mode !== previous.mode || state.mission?.paused !== previous.mission?.paused) lastPosition = null;
    if (stopped || evaOf(state).phase === 'ended') return;
    if (state.finds?.list !== previous.finds?.list) recordFinds(store);
    if (state.route === previous.route) return;
    keepPlan(store);
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
      ...positionOf(state),   // where the plan changed, for the debrief map (#274)
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
    if (stopped) return;
    const state = store.getState();
    const eva = evaOf(state);
    if (eva.phase === 'ended') return;
    ending = false;   // continueEva() brought the EVA back

    const nav = state.navigation;
    const truth = truePosition(nav);
    if (!isFiniteNumber(truth.x) || !isFiniteNumber(truth.z)) {
      lastPosition = null;
      return;
    }

    // No distance while paused or in Plan. Clearing the baseline also means a mode switch, a resume or a teleport
    // cannot add one large jump on the next Walk tick.
    if (state.mode !== 'walk' || state.mission?.paused === true) {
      lastPosition = null;
      return;
    }

    const inside = (habitat !== null && distanceToHab(truth, habitat) <= HAB_ARRIVAL_RADIUS_M) || habitatZoneAt(truth.x, truth.z) !== null;

    if (eva.phase === 'ready') {
      // The EVA starts on the first Walk tick with the mission running, wherever the astronaut stands (#244): they
      // began it at the mission table, and being at the habitat no longer ends it by itself.
      lastPosition = { x: truth.x, z: truth.z };
      sinceTrackM = 0;
      const first = trackPoint(state, truth, eva, inside, slopeAt);
      const patch = { phase: 'active', startedAtSec: missionTimeSec(state), atHabitat: inside, track: withPoint(eva.track, first) };
      const minOxygen = lowest(null, state.suit?.marginSec);
      const minBattery = lowest(null, state.suit?.batteryPct);
      if (minOxygen !== null) {
        patch.minOxygenMarginSec = minOxygen;
        patch.lowPoint = first;
      }
      if (minBattery !== null) patch.minBatteryPct = minBattery;
      writeEva(store, patch);
      return;
    }

    let distanceM = eva.distanceM;
    if (lastPosition) {
      const step = Math.hypot(truth.x - lastPosition.x, truth.z - lastPosition.z);
      if (isFiniteNumber(step) && step > 0) {
        distanceM += step;
        sinceTrackM += step;
      }
    }
    lastPosition = { x: truth.x, z: truth.z };

    const minOxygen = lowest(eva.minOxygenMarginSec, state.suit?.marginSec);
    const minBattery = lowest(eva.minBatteryPct, state.suit?.batteryPct);
    const point = trackPoint(state, truth, eva, inside, slopeAt);
    // The point where the lowest margin was read: often between two track points (standing at a stop, on the airlock
    // steps), so the debrief's chart would otherwise show a higher minimum than its headline.
    const lowPoint = minOxygen !== eva.minOxygenMarginSec ? point : eva.lowPoint ?? null;

    if (inside && eva.endRequested) {
      // Count the last steps, the current margins and the point where the walk ended before freezing the summary.
      const track = withPoint(eva.track, point);
      sinceTrackM = 0;
      endEva({ distanceM, minOxygenMarginSec: minOxygen, minBatteryPct: minBattery, atHabitat: false, endRequested: false, track, lowPoint });
      return;
    }

    const patch = {};
    // One track point every TRACK_STEP_M of walking, measured along the steps like the distance (#274).
    if (sinceTrackM >= TRACK_STEP_M || !Array.isArray(eva.track) || eva.track.length === 0) {
      const track = withPoint(eva.track, point);
      if (track !== eva.track) patch.track = track;
      sinceTrackM = 0;
    }
    if (lowPoint !== (eva.lowPoint ?? null)) patch.lowPoint = lowPoint;
    if (inside !== eva.atHabitat) patch.atHabitat = inside;
    if (!inside && eva.endRequested) patch.endRequested = false;   // only at the habitat
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
