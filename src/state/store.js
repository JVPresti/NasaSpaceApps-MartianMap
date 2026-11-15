// Mission store: one snapshot of everything the interface shows. The simulation writes it a few times per second;
// React components subscribe to the slices they need. Contract and field list: docs/STATE_AND_ENGINE.md.
// No React and no three.js here: the hook comes from Zustand, and the simulation can use the store without React.
import { create } from 'zustand';
import { createInitialEvaState } from './eva.js';

/** Plain data only. Units are in the field names. Coordinates: x east, z south, metres from Cheyava Falls. */
export function createInitialState() {
  return {
    mode: 'plan',                                   // 'walk' | 'plan'; the app opens at the planning table (#166)
    // Clock fields: docs/STATE_AND_ENGINE.md. anchorMs is the wall timestamp elapsedSec is measured from;
    // startedAtMs is the first start. The mission clock fills anchorMs and the fields after it when it starts.
    mission: {
      startedAtMs: null, elapsedSec: 0, paused: false, sol: null, lmst: null,
      anchorMs: null, timeScale: 1, initialSol: null, initialLmst: null, longitudeDeg: null, sky: null,
    },
    suit: { oxygenG: null, oxygenSec: null, oxygenPct: null, batteryPct: null, pressurePsi: null, metabolicW: null, effort: null, walkbackSec: null, walkbackO2G: null, marginSec: null, status: null },
    navigation: { x: null, z: null, trueX: null, trueZ: null, headingDeg: null, slopeDeg: null, waypointRangeM: null, waypointBearingDeg: null, errorM: null, fixMode: null, lastFixSec: null },   // x/z: the estimate the HUD shows (#42); trueX/trueZ: the true position, engine bridge only
    route: { waypoints: [], path: null, nextIndex: 0, visited: [], distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null, reason: null, shelter: null, legs: [], totals: null, decision: 'pending', skipped: [] },   // shelter: the entry of shelters.json the re-planner chose, while an event is active; legs and totals: src/sim/legCosts.js
    environment: { dustOpacity: 0, tempC: null, windMs: null, pressurePa: null, doseRateUgyH: null, doseUgy: null },
    // Active hazard areas for the minimap (#60): [{ id, x, z, radiusM, active }], metres. Empty means
    // "no zone known", not "safe". No writer yet; the event work (#24-#26) fills it. The minimap draws
    // only active === true entries with a finite centre and radiusM > 0.
    hazards: { zones: [] },
    alerts: {},                                     // { [eventId]: { id, eventId, level, text, startedAtSec, active } | null }
    crew: [],                                       // [{ id, name, color, x, z, oxygenPct, batteryPct }]
    // #36, written by src/state/sampling.js: samples secured this EVA, the checklist of the sample in progress, and the engine's
    // sampling status (what the crosshair is on, the clip phase, the partner's case and what each input does), 5 times per second
    sampling: { count: 0, photos: 0, samples: [], checklist: { photo: false, texture: false, sample: false, seal: false, photoAt: null, siteAt: null, sampleId: null }, status: null },
    // #43, written by src/state/eva.js: statistics and history for the debrief. `phase` is 'ready' until the astronaut
    // first walks outside the habitat arrival area, 'active' during the EVA and 'ended' when they re-enter the HAB;
    // `summary` is then a frozen snapshot with the outside time, distance, minima, events, route changes, samples and
    // current radiation reading. The HAB entry is the one in shelters.json, not the HAB route waypoint.
    eva: createInitialEvaState(),
    // #71, written by src/state/finds.js: points the player marked by pointing, at most MAX_FINDS (src/sim/findDetour.js).
    // list: [{ id, label, x, z, status: 'pricing' | 'priced' | 'error' | 'accepted', detour, error }]; activeId: the find
    // the decision card shows; routeKey: waypointKey of the waypoints a Walk re-plan already routed, so Plan does not start over.
    finds: { list: [], seq: 0, activeId: null, routeKey: null },
    view: { layer: 0, sky: 'late_afternoon', skyBlend: 0, slopeGrid: false },   // what the engine draws; #59 demo starts in late-afternoon light
    sources: {},                                    // { 'environment.tempC': { tag: 'DATA' | 'DERIVED' | 'SIM', source } }
  };
}

/** React hook and store. Select slices: useMissionStore((s) => s.suit.oxygenPct). */
export const useMissionStore = create(() => createInitialState());

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function splitPath(path) {
  if (typeof path !== 'string' || !path) throw new Error('store path must be a non-empty string');
  const parts = path.split('.');
  for (const p of parts) if (!p || FORBIDDEN.has(p)) throw new Error('invalid store path: ' + path);
  return parts;
}

function getIn(obj, parts) {
  let o = obj;
  for (const p of parts) { if (o === null || typeof o !== 'object' || !Object.hasOwn(o, p)) return undefined; o = o[p]; }
  return o;
}

// Immutable write: copies every object on the path, so selectors on any parent see a new reference.
function setIn(obj, parts, value) {
  const [head, ...rest] = parts;
  const base = obj !== null && typeof obj === 'object' ? obj : {};
  const copy = Array.isArray(base) ? [...base] : { ...base };   // crew.0.x keeps crew an array
  copy[head] = rest.length ? setIn(base[head], rest, value) : value;
  return copy;
}

/**
 * Adapter with the contract of docs/EVENT_ENGINE.md: get(path), set(path, value), snapshot().
 * Pass it as the store of createEventEngine. Writes go through Zustand, so subscribed components update.
 */
export function createStoreAdapter(store = useMissionStore) {
  return {
    get: (path) => getIn(store.getState(), splitPath(path)),
    set: (path, value) => { const parts = splitPath(path); store.setState((s) => setIn(s, parts, value), true); },
    snapshot: () => structuredClone(store.getState()),
  };
}

export const storeAdapter = createStoreAdapter();

// Small actions for the interface.
export const setMode = (mode) => { if (mode !== 'walk' && mode !== 'plan') throw new Error('mode must be walk or plan'); useMissionStore.setState({ mode }); };
export const setLayer = (layer) => storeAdapter.set('view.layer', layer);
export const setSky = (sky) => storeAdapter.set('view.sky', sky);
export const setRoutePath = (path) => storeAdapter.set('route.path', path);
/** @param {'pending' | 'go' | 'no-go'} decision */
export const setRouteDecision = (decision) => {
  if (!['pending', 'go', 'no-go'].includes(decision)) throw new Error('route decision must be pending, go or no-go');
  storeAdapter.set('route.decision', decision);
};
export const resetStore = () => useMissionStore.setState(createInitialState(), true);

// Mission clock controls. The clock runner subscribes to `mission.paused` and `mission.timeScale`, so these
// actions (and a direct storeAdapter.set / setState with the same paths) are anchored at the exact moment they
// happen. The clock never overwrites a pause with its own value.
export const setMissionPaused = (paused) => {
  if (typeof paused !== 'boolean') throw new Error('mission.paused must be a boolean');
  storeAdapter.set('mission.paused', paused);
};
export const pauseMission = () => setMissionPaused(true);
export const resumeMission = () => setMissionPaused(false);
export const setMissionTimeScale = (scale) => {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) throw new Error('mission.timeScale must be a finite number greater than 0');
  storeAdapter.set('mission.timeScale', scale);
};
