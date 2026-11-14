// Mock values so HUD and Plan work can start before the simulation exists. Every value is tagged SIM.
// Load them with ?mock=1 in the URL. Real numbers come from the hazard table (#18) and the simulation issues.
import { useMissionStore, createInitialState } from './store.js';

// Waypoints of public/marswalk/assets/route.json, drawn as straight legs (a placeholder, not a planned route).
const WAYPOINTS = [
  { name: 'HAB', x: 520, z: 600 },
  { name: 'WP1 · channel floor', x: 330, z: 300 },
  { name: 'WP2 · dune field edge', x: 150, z: 120 },
  { name: 'WP3 · Bright Angel outcrop', x: -40, z: -60 },
  { name: 'Cheyava Falls', x: 0, z: 0 },
];

const SIM = { tag: 'SIM', source: 'mock value (src/state/mock.js), not a measurement' };

export function createMockState() {
  const base = createInitialState();
  const state = {
    ...base,
    mission: { startedAtMs: Date.now(), elapsedSec: 103 * 60, paused: false, sol: 1210, lmst: '15:20' },
    suit: { oxygenSec: 4.1 * 3600, oxygenPct: 78, batteryPct: 75, pressurePsi: 4.3, walkbackSec: 41 * 60, effort: 0.4 },
    navigation: { x: 8, z: 70, headingDeg: 354, errorM: 0.4, fixMode: 'terrain fix', lastFixSec: 3 * 60 },
    route: { waypoints: WAYPOINTS, path: WAYPOINTS.map((w) => [w.x, w.z]), nextIndex: 2, distanceM: 930, climbM: 30, steepestSlopeDeg: 23, etaSec: 15 * 60, reason: null, decision: 'pending', skipped: [] },
    environment: { dustOpacity: 0.62, tempC: -18, windMs: 8, pressurePa: 724, doseRateUgyH: 16, doseUgy: 16.1 },
    crew: [{ id: 'EV2', name: 'EV2', color: [0.05, 0.25, 0.9], x: 15, z: 39, oxygenPct: 81, batteryPct: 70 }],
  };
  const sources = {};
  for (const section of ['mission', 'suit', 'navigation', 'route', 'environment']) for (const key of Object.keys(state[section])) sources[section + '.' + key] = SIM;
  return { ...state, sources };
}

/** Loads the mock values when the page URL has ?mock=1. Returns true when it did. */
export function applyMockFromUrl(search = window.location.search) {
  if (new URLSearchParams(search).get('mock') !== '1') return false;
  useMissionStore.setState(createMockState(), true);
  return true;
}
