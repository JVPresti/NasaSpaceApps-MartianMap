/**
 * Navigation drift model (#42): the error between the astronaut's true position and the position the suit reports.
 *
 * Mars has no navigation satellites and no global magnetic field, so the suit estimates its position the way
 * Perseverance does (docs/IMPLEMENTATION_PLAN.md, section 4.2). The simulation knows the true position (written
 * by the engine bridge into `navigation.trueX` / `trueZ`); this runner produces the estimate the HUD shows
 * (`navigation.x` / `z`), offset from the truth by the current error `navigation.errorM`.
 *
 * The model:
 * - Dead reckoning: the error grows with the distance walked, at a named SIM rate of 1 to 2 % (section 4.2).
 * - Terrain fix: standing still for FIX_STILL_SEC with the horizon visible resets the error below 1 m.
 *   No fixes in a dust storm or at night.
 * - Radio ranging: with line of sight to the habitat mast the error is bounded at RANGING_BOUND_M.
 *
 * Plain JavaScript: the store is any object with getState / setState (the Zustand store in src/state/store.js),
 * the terrain is the engine's lineOfSight query and the mast comes from engine.getHabitatMast(). No React,
 * no three.js. Deterministic tests inject `random`.
 */
import { radioLinkState } from './radio.js';
import { FIX_MODES, NAVIGATION_SOURCES, NAV_FIX_ERROR_M } from './navigation.js';

export const NAV_DRIFT_TICK_MS = 250;

/** Error growth of dead reckoning: fraction of the distance walked since the last fix (SIM, the 1 to 2 % of section 4.2). */
export const DRIFT_RATE_PER_M = 0.02;

/** Standing still this long takes a terrain fix, when the air is clear and the horizon visible (SIM, section 4.2: "a few seconds"). */
export const FIX_STILL_SEC = 5;

/** Below this speed the astronaut counts as standing still, m/s (SIM). */
export const FIX_STILL_SPEED_MS = 0.2;

/** Radio ranging to the habitat mast bounds the error at this many metres (SIM). */
export const RANGING_BOUND_M = 2;

/** Horizon check for a terrain fix: rays to this distance in this many directions; a fix needs HORIZON_MIN_CLEAR clear rays (SIM). */
export const HORIZON_CHECK_M = 150;
export const HORIZON_DIRECTIONS = 8;
export const HORIZON_MIN_CLEAR = 5;

/** How fast the offset direction wanders while walking, radians per tick (SIM: odometry heading error). */
export const OFFSET_TURN_RAD_PER_TICK = 0.25;

/** Dust opacity (tau) at or below which the cameras can still match the terrain: no fixes above it. SIM,
 *  the same value as `values.dust.event.nav_fix_tau_max` in public/data/hazards.json (Sanchez-Lavega et al. 2025). */
export const FIX_TAU_MAX = 1.0;

/**
 * How many of the horizon rays from a point are clear. The rays sit at eye height on the real terrain, so a
 * closed sky (a pit, the foot of a scarp) returns few.
 * @param {(a: object, b: object) => { clear: boolean }} lineOfSight
 * @param {{ x: number, z: number }} point
 * @param {number} distanceM
 * @param {number} directions evenly spaced, starting east
 * @returns {number} clear rays, 0 to directions
 */
export function horizonClearCount(lineOfSight, point, distanceM = HORIZON_CHECK_M, directions = HORIZON_DIRECTIONS) {
  if (typeof lineOfSight !== 'function' || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return 0;
  let clear = 0;
  for (let i = 0; i < directions; i += 1) {
    const a = (2 * Math.PI * i) / directions;
    const target = { x: point.x + Math.sin(a) * distanceM, z: point.z + Math.cos(a) * distanceM };
    if (lineOfSight(point, target)?.clear) clear += 1;
  }
  return clear;
}

/**
 * One drift step. Pure, so the growth, the fix and the ranging rules can be tested without timers.
 * @param {object} state previous drift state (see createDriftState)
 * @param {{ movedM: number, speedMs: number, dtSec: number, ranging: boolean, fixAllowed: boolean,
 *   elapsedSec: number, random?: () => number }} input
 * @returns {object} the next drift state
 */
export function stepDrift(state, { movedM, speedMs, dtSec, ranging, fixAllowed, elapsedSec, random = Math.random }) {
  const next = {
    errorM: state.errorM,
    fixMode: state.fixMode,
    lastFixSec: state.lastFixSec,
    offsetDx: state.offsetDx,
    offsetDz: state.offsetDz,
    distanceSinceFixM: state.distanceSinceFixM + Math.max(0, movedM),
    stillSec: speedMs < FIX_STILL_SPEED_MS ? state.stillSec + Math.max(0, dtSec) : 0,
  };

  if (fixAllowed && next.stillSec >= FIX_STILL_SEC) {
    // A terrain fix: the estimate snaps close to the truth in a new direction, and the walked-distance error is gone.
    const a = random() * Math.PI * 2;
    next.errorM = NAV_FIX_ERROR_M;
    next.fixMode = FIX_MODES.terrainFix;
    next.lastFixSec = elapsedSec;
    next.offsetDx = Math.sin(a) * NAV_FIX_ERROR_M;
    next.offsetDz = Math.cos(a) * NAV_FIX_ERROR_M;
    next.distanceSinceFixM = 0;
    next.stillSec = 0;
    return next;
  }

  const driftError = NAV_FIX_ERROR_M + DRIFT_RATE_PER_M * next.distanceSinceFixM;
  next.errorM = ranging ? Math.min(driftError, RANGING_BOUND_M) : driftError;
  if (movedM > 0) {
    // Dead reckoning only accumulates while walking; standing still stays on the last fix mode (a fresh terrain
    // fix keeps showing 'terrain fix' until the astronaut walks away from it).
    next.fixMode = ranging && driftError > RANGING_BOUND_M ? FIX_MODES.radioRanging : FIX_MODES.deadReckoning;
  }

  // The offset keeps its direction while standing still and turns slowly while walking (odometry heading error).
  const mag = Math.hypot(state.offsetDx, state.offsetDz) || NAV_FIX_ERROR_M;
  let dx = state.offsetDx / mag, dz = state.offsetDz / mag;
  if (movedM > 0) {
    const turn = (random() - 0.5) * OFFSET_TURN_RAD_PER_TICK;
    const c = Math.cos(turn), s = Math.sin(turn);
    const ndx = dx * c - dz * s, ndz = dx * s + dz * c;
    dx = ndx; dz = ndz;
  }
  next.offsetDx = dx * next.errorM;
  next.offsetDz = dz * next.errorM;
  return next;
}

/**
 * A fresh drift state for a store value: a terrain fix at `elapsedSec` when nothing else is known, or the
 * store's own values after a re-fix (initNavigation, #21).
 * @param {{ errorM?: number | null, fixMode?: string | null, lastFixSec?: number | null }} nav
 * @param {number} elapsedSec
 * @param {() => number} random
 */
export function createDriftState(nav, elapsedSec, random = Math.random) {
  const errorM = Number.isFinite(nav?.errorM) ? nav.errorM : NAV_FIX_ERROR_M;
  const a = random() * Math.PI * 2;
  return {
    errorM,
    fixMode: nav?.fixMode || FIX_MODES.terrainFix,
    lastFixSec: Number.isFinite(nav?.lastFixSec) ? nav.lastFixSec : elapsedSec,
    offsetDx: Math.sin(a) * errorM,
    offsetDz: Math.cos(a) * errorM,
    distanceSinceFixM: 0,
    stillSec: 0,
  };
}

/**
 * Runs the drift model against the mission store a few times per second: reads the true position
 * (`navigation.trueX` / `trueZ`, written by the engine bridge), steps the error and writes the estimate
 * (`navigation.x` / `z`, `errorM`, `fixMode`, `lastFixSec`). Without a true position it writes nothing. Ticks
 * while the mission is paused change nothing; `FIX_STILL_SEC` counts wall time, so a paused astronaut never
 * takes a fix.
 *
 * @param {{ store: { getState: Function, setState: Function },
 *   lineOfSight?: (a: object, b: object) => { clear: boolean },
 *   getMast?: () => { x: number, y?: number, z: number } | null,
 *   now?: () => number, random?: () => number, setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startNavigationDrift({
  store,
  lineOfSight,
  getMast = () => null,
  now = () => Date.now(),
  random = Math.random,
  setInterval: si = setInterval,
  clearInterval: ci = clearInterval,
}) {
  let state = null;   // drift state, seeded from the store on the first tick or after an external re-fix
  let last = null;    // { t, x, z } true position at the previous tick

  store.setState((s) => ({ sources: { ...s.sources, ...NAVIGATION_SOURCES } }));

  function tick() {
    const s = store.getState();
    const nav = s.navigation ?? {};
    const trueX = nav.trueX, trueZ = nav.trueZ;
    if (!Number.isFinite(trueX) || !Number.isFinite(trueZ)) { last = null; return; }   // bridge not reporting yet: never drift around the estimate
    const t = now();
    const dtSec = last ? Math.min(1, Math.max(0, (t - last.t) / 1000)) : 0;
    const movedM = last ? Math.hypot(trueX - last.x, trueZ - last.z) : 0;
    const speedMs = dtSec > 0 ? movedM / dtSec : 0;
    if (s.mission?.paused) { last = { t, x: trueX, z: trueZ }; return; }   // nothing drifts while paused
    const elapsedSec = Number.isFinite(s.mission?.elapsedSec) ? s.mission.elapsedSec : 0;

    // Re-fix (a new EVA at the airlock, initNavigation): start over from the store's fresh values.
    if (!state || state.lastFixSec !== nav.lastFixSec) state = createDriftState(nav, elapsedSec, random);

    const mast = getMast();
    const ranging = mast && typeof lineOfSight === 'function'
      ? radioLinkState({ point: { x: trueX, z: trueZ }, mast, lineOfSight }).clear
      : false;
    const storm = Number.isFinite(s.environment?.dustOpacity) && s.environment.dustOpacity > FIX_TAU_MAX;
    const night = s.mission?.sky === 'night';
    // The horizon is only worth ray-casting while the astronaut stands still; a fix also needs clear air and daylight.
    const still = speedMs < FIX_STILL_SPEED_MS;
    const horizonVisible = still && !storm && !night
      && horizonClearCount(lineOfSight, { x: trueX, z: trueZ }) >= HORIZON_MIN_CLEAR;
    const fixAllowed = !storm && !night && horizonVisible;

    state = stepDrift(state, { movedM, speedMs, dtSec, ranging, fixAllowed, elapsedSec, random });

    const estX = Math.round((trueX + state.offsetDx) * 100) / 100;
    const estZ = Math.round((trueZ + state.offsetDz) * 100) / 100;
    const errorM = Math.round(state.errorM * 1000) / 1000;
    last = { t, x: trueX, z: trueZ };
    if (estX === nav.x && estZ === nav.z && errorM === nav.errorM && state.fixMode === nav.fixMode && state.lastFixSec === nav.lastFixSec) {
      return;   // nothing changed: no store update, no re-render
    }
    store.setState((st) => ({
      navigation: { ...st.navigation, x: estX, z: estZ, errorM, fixMode: state.fixMode, lastFixSec: state.lastFixSec },
    }));
  }

  const timer = si(tick, NAV_DRIFT_TICK_MS);
  return { tick, stop: () => ci(timer) };
}
