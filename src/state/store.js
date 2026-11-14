// Mission store: one snapshot of everything the interface shows. The simulation writes it a few times per second;
// React components subscribe to the slices they need. Contract and field list: docs/STATE_AND_ENGINE.md.
// No React and no three.js here: the hook comes from Zustand, and the simulation can use the store without React.
import { create } from 'zustand';

/** Plain data only. Units are in the field names. Coordinates: x east, z south, metres from Cheyava Falls. */
export function createInitialState() {
  return {
    mode: 'walk',                                   // 'walk' | 'plan'
    mission: { startedAtMs: null, elapsedSec: 0, paused: false, sol: null, lmst: null },
    suit: { oxygenG: null, oxygenSec: null, oxygenPct: null, batteryPct: null, pressurePsi: null, metabolicW: null, effort: null, walkbackSec: null, walkbackO2G: null, marginSec: null, status: null },
    navigation: { x: null, z: null, headingDeg: null, errorM: null, fixMode: null, lastFixSec: null },   // the estimate, never the truth: no GPS on Mars
    route: { waypoints: [], path: null, nextIndex: 0, distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null, reason: null, legs: [], totals: null },   // legs and totals: src/sim/legCosts.js
    environment: { dustOpacity: 0, tempC: null, windMs: null, pressurePa: null, doseRateUgyH: null, doseUgy: null },
    alerts: {},                                     // { [eventId]: { id, eventId, level, text, startedAtSec, active } | null }
    crew: [],                                       // [{ id, name, color, x, z, oxygenPct, batteryPct }]
    view: { layer: 0, sky: 'clear_day' },           // what the engine draws
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
export const resetStore = () => useMissionStore.setState(createInitialState(), true);
