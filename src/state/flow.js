/**
 * Where the astronaut is in the simulator, from the habitat to the debrief (habitat-first flow).
 *
 *   habitat ──Begin EVA──▶ egress ──cycle done──▶ eva ──back at the airlock──▶ ingress ──cycle done──▶ debrief
 *      ▲                                                                                                │
 *      └──────────────────────────── restart (Plan the next EVA, Back to the habitat) ◀──────────────────┘
 *
 * - `habitat`: inside, before the EVA. The astronaut walks around in first person and plans at the mission table
 *   (store `mode` 'plan' while the table is open). The mission clock is held, no suit or event runner exists yet,
 *   the outer hatch stays shut and the partner waits out of sight.
 * - `egress`: the airlock cycle after Begin EVA. The route is fixed. The engine moves the player outside while the
 *   screen is dark.
 * - `eva`: on the surface. `startSimulation` starts the EVA runners on this transition: a new clock at 0:00, full
 *   consumables, the terrain fix at the airlock, events, partner and statistics.
 * - `ingress`: the airlock cycle after the EVA runner froze `eva.summary` at the habitat entry.
 * - `debrief`: back inside with the summary on screen. Only a restart leaves it.
 *
 * Restarting (pause menu, debrief) resets the store, which puts the stage back to `habitat`. There is no other way
 * back: a transition that is not in NEXT throws, so a late timer or a double click cannot skip a stage.
 *
 * Plain JavaScript: no React and no three.js. The store is injected, like the other runners.
 */
import { useMissionStore } from './store.js';

export const STAGE = Object.freeze({
  HABITAT: 'habitat',
  EGRESS: 'egress',
  EVA: 'eva',
  INGRESS: 'ingress',
  DEBRIEF: 'debrief',
});

const NEXT = Object.freeze({
  [STAGE.HABITAT]: [STAGE.EGRESS],
  [STAGE.EGRESS]: [STAGE.EVA],
  [STAGE.EVA]: [STAGE.INGRESS],
  [STAGE.INGRESS]: [STAGE.DEBRIEF],
  [STAGE.DEBRIEF]: [],
});

/** Length of one airlock cycle on screen, in ms. A real cycle takes minutes; the demo shortens it. */
export const AIRLOCK_CYCLE_MS = 2600;
/** The screen is fully dark from this fraction of the cycle on, so the engine can move the player unseen. */
export const AIRLOCK_DARK_AT = 0.25;

/** True when the simulator may go from `from` to `to`. */
export function canAdvance(from, to) {
  return (NEXT[from] ?? []).includes(to);
}

/** True while the astronaut is inside before the EVA, the only stage where the mission table opens. */
export const isPlanning = (state) => (state.stage ?? STAGE.HABITAT) === STAGE.HABITAT;
/** True while the EVA runners own the mission: the suit HUD, events, sampling and the wrist. */
export const isOnSurface = (state) => state.stage === STAGE.EVA;
/** True during either airlock cycle. */
export const inAirlock = (state) => state.stage === STAGE.EGRESS || state.stage === STAGE.INGRESS;

function advance(store, to) {
  const from = store.getState().stage ?? STAGE.HABITAT;
  if (!canAdvance(from, to)) throw new Error(`flow: cannot go from ${from} to ${to}`);
  store.setState({ stage: to });
}

/**
 * Begin EVA at the mission table: the route is fixed and the airlock cycle starts. Closes the table (mode 'walk')
 * in the same write, so nothing renders the table over the cycle.
 */
export function beginEgress(store = useMissionStore) {
  const from = store.getState().stage ?? STAGE.HABITAT;
  if (!canAdvance(from, STAGE.EGRESS)) throw new Error(`flow: cannot go from ${from} to ${STAGE.EGRESS}`);
  store.setState({ stage: STAGE.EGRESS, mode: 'walk' });
}

/** The cycle is over and the player stands outside: the EVA starts (see startSimulation). */
export const completeEgress = (store = useMissionStore) => advance(store, STAGE.EVA);

/** The EVA runner froze the summary at the habitat entry: cycle back in. */
export const beginIngress = (store = useMissionStore) => advance(store, STAGE.INGRESS);

/** Back inside: the debrief owns the screen until a restart. */
export const completeIngress = (store = useMissionStore) => advance(store, STAGE.DEBRIEF);

/**
 * Progress of an airlock cycle that only advances while `running()` is true, so a pause menu stops it.
 * `onDark` fires once when the screen is fully dark, `onDone` once at the end. Plain timers, so tests can drive it
 * with a fake clock.
 *
 * @param {{ durationMs?: number, darkAt?: number, now?: () => number, schedule?: (fn: () => void) => unknown,
 *   cancel?: (handle: unknown) => void, running?: () => boolean, onProgress?: (ratio: number) => void,
 *   onDark?: () => void, onDone?: () => void }} options
 * @returns {{ stop: () => void, progress: () => number }}
 */
export function runAirlockCycle({
  durationMs = AIRLOCK_CYCLE_MS,
  darkAt = AIRLOCK_DARK_AT,
  now = () => performance.now(),
  schedule = (fn) => requestAnimationFrame(fn),
  cancel = (handle) => cancelAnimationFrame(handle),
  running = () => true,
  onProgress = () => {},
  onDark = () => {},
  onDone = () => {},
} = {}) {
  let elapsed = 0, last = now(), handle = null, stopped = false, dark = false, ratio = 0;
  const step = () => {
    handle = null;
    if (stopped) return;
    const t = now(), dt = Math.max(0, t - last);
    last = t;
    if (running()) elapsed += dt;
    ratio = Math.min(1, elapsed / durationMs);
    onProgress(ratio);
    if (!dark && ratio >= darkAt) { dark = true; onDark(); }
    if (ratio >= 1) { stopped = true; onDone(); return; }
    handle = schedule(step);
  };
  handle = schedule(step);
  return {
    stop() { stopped = true; if (handle !== null) cancel(handle); handle = null; },
    progress: () => ratio,
  };
}
