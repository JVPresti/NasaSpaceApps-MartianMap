/**
 * Where the astronaut is in the simulator, from the habitat to the debrief (habitat-first flow).
 *
 *   habitat ──Begin EVA──▶ egress ──cycle done──▶ eva ──X at the table, back inside (#244)──▶ debrief
 *      ▲                                             ▲                                          │
 *      │                                             └──────────── Continue EVA ◀───────────────┤
 *      └────────────────────────── restart (Restart, End the EVA: a new EVA at the table) ◀──────┘
 *
 * - `habitat`: inside, before the EVA. The astronaut walks around in first person and plans at the mission table
 *   (store `mode` 'plan' while the table is open). The table also reopens from the cabin during the EVA ("[E] Open plan",
 *   #282). The mission clock is held, no suit or event runner exists yet,
 *   the outer hatch stays shut and the partner waits out of sight.
 * - `egress`: the airlock cycle after Begin EVA. The route is fixed. The engine moves the player outside while the
 *   screen is dark.
 * - `eva`: on the surface. `startSimulation` starts the EVA runners on this transition: a new clock at 0:00, the O2 and
 *   battery the crew set at the table (`startConsumables(needs)`, #265), the terrain fix at the airlock, events, the
 *   partner (none for a crew of one) and statistics.
 * - `debrief`: the astronaut walked back in through the airlock and ended the EVA with X at the table (#244), so the
 *   EVA runner froze `eva.summary`. There is no cycle on the way in: the player already came through the real hatch.
 *   Continue EVA goes back to `eva` with the statistics still counting; a restart goes back to `habitat`.
 *
 * Transitions follow NEXT: forward, plus debrief back to eva for Continue EVA. Restarting (pause menu, debrief) resets
 * the store, which puts the stage back to `habitat`; there is no other way back. A transition that is not in NEXT
 * throws, so a late timer or a double click cannot skip a stage.
 *
 * Plain JavaScript: no React and no three.js. The store is injected, like the other runners.
 */
import { useMissionStore } from './store.js';

export const STAGE = Object.freeze({
  HABITAT: 'habitat',
  EGRESS: 'egress',
  EVA: 'eva',
  DEBRIEF: 'debrief',
});

const NEXT = Object.freeze({
  [STAGE.HABITAT]: [STAGE.EGRESS],
  [STAGE.EGRESS]: [STAGE.EVA],
  [STAGE.EVA]: [STAGE.DEBRIEF],
  [STAGE.DEBRIEF]: [STAGE.EVA],
});

/** Length of one airlock cycle on screen, in ms, shortened for the demo (SIM: not a real depressurisation time). */
export const AIRLOCK_CYCLE_MS = 2600;
/** The screen is fully dark from this fraction of the cycle on, so the engine can move the player unseen. */
export const AIRLOCK_DARK_AT = 0.25;
/** At least this long between the move (onDark) and the end (onDone), even after one very long frame. */
export const AIRLOCK_MIN_DARK_MS = 400;

/** True when the simulator may go from `from` to `to`. */
export function canAdvance(from, to) {
  return (NEXT[from] ?? []).includes(to);
}

/** False during the airlock cycle, which owns the screen: no Plan / Walk switch from any key, pad or menu. */
export const canSwitchMode = (state) => state.stage !== STAGE.EGRESS;

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
  // The route and the crew's needs are fixed from here (#265): the EVA starts from them at the end of the cycle.
  store.setState((s) => ({ stage: STAGE.EGRESS, mode: 'walk', needs: s.needs ? { ...s.needs, locked: true } : s.needs }));
}

/** The cycle is over and the player stands outside: the EVA starts (see startSimulation). */
export const completeEgress = (store = useMissionStore) => advance(store, STAGE.EVA);

/** The EVA runner froze the summary: the debrief owns the screen until Continue EVA or a restart. */
export const showDebrief = (store = useMissionStore) => advance(store, STAGE.DEBRIEF);

/** Continue EVA on the debrief (#244): back on the surface, the statistics still counting. */
export const continueFromDebrief = (store = useMissionStore) => advance(store, STAGE.EVA);

/**
 * Progress of an airlock cycle that only advances while `running()` is true, so a pause menu stops it.
 * `onDark` fires once when the screen is fully dark, `onDone` once at the end. Plain timers, so tests can drive it
 * with a fake clock.
 *
 * @param {{ durationMs?: number, darkAt?: number, minDarkMs?: number, now?: () => number, schedule?: (fn: () => void) => unknown,
 *   cancel?: (handle: unknown) => void, running?: () => boolean, onProgress?: (ratio: number) => void,
 *   onDark?: () => void, onDone?: () => void }} options
 * @returns {{ stop: () => void, progress: () => number }}
 */
export function runAirlockCycle({
  durationMs = AIRLOCK_CYCLE_MS,
  darkAt = AIRLOCK_DARK_AT,
  minDarkMs = AIRLOCK_MIN_DARK_MS,
  now = () => performance.now(),
  schedule = (fn) => requestAnimationFrame(fn),
  cancel = (handle) => cancelAnimationFrame(handle),
  running = () => true,
  onProgress = () => {},
  onDark = () => {},
  onDone = () => {},
} = {}) {
  let elapsed = 0, last = now(), handle = null, stopped = false, dark = false, darkAtMs = 0, ratio = 0;
  const step = () => {
    handle = null;
    if (stopped) return;
    const t = now(), dt = Math.max(0, t - last);
    last = t;
    if (running()) elapsed += dt;
    // A long frame (a busy machine, a screenshot) can jump past both points at once. The move then still gets its
    // own frame and some running time before the end, so the player is outside before the EVA starts.
    if (dark) ratio = Math.min(1, elapsed / durationMs);
    else ratio = Math.min(darkAt, elapsed / durationMs);
    onProgress(ratio);
    if (!dark && ratio >= darkAt) { dark = true; darkAtMs = elapsed; onDark(); }
    else if (ratio >= 1 && elapsed - darkAtMs >= minDarkMs) { stopped = true; onDone(); return; }
    handle = schedule(step);
  };
  handle = schedule(step);
  return {
    stop() { stopped = true; if (handle !== null) cancel(handle); handle = null; },
    progress: () => ratio,
  };
}
