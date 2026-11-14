/**
 * Navigation estimate (#21). Mars has no navigation satellites and no global magnetic field, so the suit is never told
 * where it is: it estimates its position the way Perseverance does (docs/IMPLEMENTATION_PLAN.md, section 4.2). A terrain
 * fix matches the helmet cameras to the HiRISE map; between fixes, dead reckoning counts steps and the error grows.
 *
 * For now this only seeds the store with a small fixed error, as if a terrain fix had just been taken, and tags it SIM.
 * The drift model (#42) replaces it with a runner that grows the error while walking and resets it after a fix.
 * x and z stay with the engine bridge, which writes the true position until #42 writes the estimate instead.
 *
 * Plain JavaScript: the store is any object with getState / setState (the Zustand store in src/state/store.js).
 */

/** Uncertainty radius in metres right after a terrain fix (SIM). Perseverance's map matching reaches about 25 cm; we round up. */
export const NAV_PLACEHOLDER_ERROR_M = 0.4;

/** How the estimate is kept, as written to navigation.fixMode and shown on the HUD navigation line. */
export const FIX_MODES = Object.freeze({ terrainFix: 'terrain fix', deadReckoning: 'dead reckoning' });

// User-facing source text (hover titles, the sources screen): say what the value is, never name a satellite system.
const PLACEHOLDER = 'SIM placeholder: a terrain fix at the start of the walk, with a fixed error until the drift model exists (src/sim/navigation.js)';
export const NAVIGATION_SOURCES = Object.freeze({
  'navigation.x': { tag: 'SIM', source: 'simulated walk: the estimate is the true position until the drift model exists' },
  'navigation.z': { tag: 'SIM', source: 'simulated walk: the estimate is the true position until the drift model exists' },
  'navigation.errorM': { tag: 'SIM', source: 'terrain fix error, fixed at ' + NAV_PLACEHOLDER_ERROR_M + ' m (Perseverance map matching: about 25 cm). ' + PLACEHOLDER },
  'navigation.fixMode': { tag: 'SIM', source: PLACEHOLDER },
  'navigation.lastFixSec': { tag: 'SIM', source: PLACEHOLDER },
});

/**
 * Writes the placeholder estimate once: a terrain fix at the current mission time with NAV_PLACEHOLDER_ERROR_M, and
 * the SIM tags. Values written later by anyone else (the console, the drift model) are left alone.
 * @param {{ store: { getState: Function, setState: Function } }} options
 */
export function initNavigation({ store }) {
  store.setState((s) => {
    const now = s.mission ? s.mission.elapsedSec : null;
    return {
      navigation: { ...s.navigation, errorM: NAV_PLACEHOLDER_ERROR_M, fixMode: FIX_MODES.terrainFix, lastFixSec: Number.isFinite(now) ? now : 0 },
      sources: { ...s.sources, ...NAVIGATION_SOURCES },
    };
  });
}
