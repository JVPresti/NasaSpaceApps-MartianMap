/**
 * Navigation estimate (#21, #42). Mars has no navigation satellites and no global magnetic field, so the suit is never told
 * where it is: it estimates its position the way Perseverance does (docs/IMPLEMENTATION_PLAN.md, section 4.2). A terrain
 * fix matches the helmet cameras to the HiRISE map; between fixes, dead reckoning counts steps and the error grows, and
 * radio ranging to the habitat bounds it.
 *
 * The drift model (src/sim/navigationDrift.js, #42) writes the estimate into `navigation.x` / `z`; the engine bridge
 * writes the true position into `navigation.trueX` / `trueZ` (src/state/engineBridge.js). This module seeds the store
 * with a fresh terrain fix at the start of an EVA and owns the SIM tags of the navigation fields.
 *
 * Plain JavaScript: the store is any object with getState / setState (the Zustand store in src/state/store.js).
 */

/** Uncertainty radius in metres right after a terrain fix (SIM). Perseverance's map matching reaches about 25 cm; we round up. */
export const NAV_FIX_ERROR_M = 0.4;

/** How the estimate is kept, as written to navigation.fixMode and shown on the HUD navigation line. */
export const FIX_MODES = Object.freeze({
  terrainFix: 'terrain fix',
  deadReckoning: 'dead reckoning',
  radioRanging: 'radio ranging',
});

/**
 * The true position from the navigation slice: the bridge's `trueX` / `trueZ` (#42), falling back to `x` / `z`
 * while the bridge has not written yet or with mock data. Simulation logic (arrival, off-route, suit effort,
 * EVA distance) reads this; the interface reads `x` / `z`, the estimate.
 * @param {{ trueX?: number | null, trueZ?: number | null, x?: number | null, z?: number | null } | null} nav
 * @returns {{ x: number | null, z: number | null }}
 */
export function truePosition(nav) {
  return {
    x: Number.isFinite(nav?.trueX) ? nav.trueX : (Number.isFinite(nav?.x) ? nav.x : null),
    z: Number.isFinite(nav?.trueZ) ? nav.trueZ : (Number.isFinite(nav?.z) ? nav.z : null),
  };
}

// User-facing source text (hover titles, the sources screen): say what the value is, never name a satellite system.
export const NAVIGATION_SOURCES = Object.freeze({
  'navigation.x': { tag: 'SIM', source: 'simulated position estimate: true position plus the drift offset (src/sim/navigationDrift.js)' },
  'navigation.z': { tag: 'SIM', source: 'simulated position estimate: true position plus the drift offset (src/sim/navigationDrift.js)' },
  'navigation.trueX': { tag: 'SIM', source: 'simulated true position from the engine (src/state/engineBridge.js); the HUD never shows it' },
  'navigation.trueZ': { tag: 'SIM', source: 'simulated true position from the engine (src/state/engineBridge.js); the HUD never shows it' },
  'navigation.errorM': { tag: 'SIM', source: 'simulated position error: dead reckoning grows it at 2 % of the distance walked, a terrain fix resets it under 1 m (Perseverance map matching: about 25 cm), radio ranging to the habitat bounds it at 2 m (src/sim/navigationDrift.js)' },
  'navigation.fixMode': { tag: 'SIM', source: 'navigation fix model: terrain fix, dead reckoning or radio ranging (src/sim/navigationDrift.js)' },
  'navigation.lastFixSec': { tag: 'SIM', source: 'mission time of the last terrain fix' },
});

/**
 * Writes a fresh terrain fix at the current mission time: the error right after a fix, the SIM tags, and the
 * estimate at the true position (the drift runner owns it from its next tick on). Values written later by the
 * drift model are left alone.
 * @param {{ store: { getState: Function, setState: Function } }} options
 */
export function initNavigation({ store }) {
  store.setState((s) => {
    const now = s.mission ? s.mission.elapsedSec : null;
    const truth = truePosition(s.navigation);
    return {
      navigation: {
        ...s.navigation,
        ...(Number.isFinite(truth.x) && Number.isFinite(truth.z) ? { x: truth.x, z: truth.z } : {}),
        errorM: NAV_FIX_ERROR_M, fixMode: FIX_MODES.terrainFix, lastFixSec: Number.isFinite(now) ? now : 0,
      },
      sources: { ...s.sources, ...NAVIGATION_SOURCES },
    };
  });
}
