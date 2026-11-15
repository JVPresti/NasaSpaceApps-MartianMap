/**
 * EVA session rules shared by the interface and the tests. These functions own the order of the real
 * contracts: the #59 mission-clock actions in src/state/store.js, the engine's pointer lock/input API and
 * the persisted clock session. Plain JavaScript: no React.
 *
 * The important invariants:
 *   - a paused mission is the only safe state behind the start screen and the pause menu;
 *   - Walk never resumes before the browser has actually granted pointer lock;
 *   - Plan resumes without a lock, because it uses orbit controls;
 *   - Walk can also resume without a lock when the player chose drag-to-look after a refused capture (#197);
 *   - Restart clears the old persisted clock session before a new clock exists, so nothing from the old
 *     EVA can reappear after a remount.
 */
import { clearClockSession, defaultSessionStorage } from '../sim/missionClock.js';
import { pauseMission, resetStore, resumeMission, useMissionStore } from './store.js';

export const EVA_PHASE = Object.freeze({ START: 'start', PLAYING: 'playing', PAUSED: 'paused' });
export const PAUSE_VIEW = Object.freeze({ MENU: 'menu', CONTROLS: 'controls', RESTART: 'restart' });

// Honest for every refusal: a denial is not always a permission problem. Right after Escape, browsers can
// need a short moment before they accept a new capture, and the next attempt must come from Resume.
const LOCK_FAILED = 'Mouse capture was not granted, so the EVA stays paused. Wait briefly after Escape, then press Enter or click the button to try again, or continue without mouse capture and drag to look around. Check your browser settings if this continues.';
const LOCK_UNAVAILABLE = 'Mouse capture is not available here. Continue without mouse capture and drag to look around.';

/**
 * Request pointer lock and turn the real result into a message the menu can show. Every refusal carries
 * `lockFailed: true`, which is what lets the menus offer to continue without mouse capture.
 * @returns {Promise<{ ok: boolean, message: string | null, lockFailed?: boolean }>}
 */
export async function requestEvaLock(engine) {
  if (!engine || typeof engine.requestPointerLock !== 'function') {
    return { ok: false, lockFailed: true, message: LOCK_UNAVAILABLE };
  }
  try {
    const locked = await engine.requestPointerLock();
    return locked ? { ok: true, message: null } : { ok: false, lockFailed: true, message: LOCK_FAILED };
  } catch (cause) {
    return { ok: false, lockFailed: true, message: (cause && cause.message) || LOCK_FAILED };
  }
}

/**
 * Resume the EVA. In Walk the pointer lock is requested first and the clock and inputs only start after a
 * real grant. In Plan there is no lock to request: orbit controls use the free mouse. With `capture: false`
 * Walk also skips the request and resumes with drag-to-look, for browsers and frames that refuse the lock.
 *
 * `isCurrent` is optional. It is checked after the browser answers, before any input or clock write, so a
 * grant that arrives after the interface paused, changed mode or restarted is abandoned instead of
 * resuming the mission behind a menu. A stale answer is silent: the newer action owns the message.
 *
 * @param {{ engine?: object, mode?: 'walk' | 'plan', isCurrent?: (() => boolean) | null, capture?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, message: string | null, stale?: boolean, lockFailed?: boolean }>}
 */
export async function resumeEva({ engine, mode = 'walk', isCurrent = null, capture = true } = {}) {
  if (mode === 'walk' && capture === false) {
    // Drag-to-look needs a free pointer. Cancel any request still in flight so a late grant cannot land.
    try { engine?.releasePointerLock?.(); } catch { /* nothing was held */ }
  } else if (mode === 'walk') {
    const lock = await requestEvaLock(engine);
    if (typeof isCurrent === 'function' && !isCurrent()) {
      try { engine?.releasePointerLock?.(); } catch { /* the lock was never wanted again */ }
      return { ok: false, stale: true, message: null };
    }
    if (!lock.ok) return lock;
  }
  try {
    engine?.setInputEnabled?.(true);
  } catch (cause) {
    return { ok: false, message: (cause && cause.message) || 'The scene input could not be enabled.' };
  }
  resumeMission();
  return { ok: true, message: null };
}

/**
 * Pause now through the real store action. Input is disabled and the pointer lock released; the #59 clock
 * anchors its elapsed value at the exact instant of the pause write.
 */
export function pauseEva({ engine } = {}) {
  try { engine?.setInputEnabled?.(false); } catch { /* still pause the mission */ }
  pauseMission();
  try { engine?.releasePointerLock?.(); } catch { /* the store pause is what matters */ }
}

/**
 * Reset the whole EVA and leave the new mission paused on the start screen.
 *
 * Order matters: stop the old runners, remove the persisted session, reset the store, return the engine to
 * the spawn, start one new simulation, then pause it. Clearing before the new clock starts is what stops an
 * old running session from being restored by a later remount.
 *
 * The engine is not recreated, so the selected quality tier (Auto/High/Low) survives the restart without a
 * second decision.
 *
 * @param {{
 *   engine?: object | null,
 *   stopSimulation?: (() => void) | null,
 *   startSimulation?: ((options: { paused: boolean }) => void) | null,
 *   storage?: object | null,
 * }} options
 * @returns {{ ok: boolean, message: string | null, startedAtMs: number | null }}
 */
export function restartEva({
  engine = null,
  stopSimulation = null,
  startSimulation = null,
  storage = defaultSessionStorage(),
} = {}) {
  const problems = [];
  const attempt = (label, fn) => {
    try { fn(); } catch (cause) { problems.push(label + ': ' + ((cause && cause.message) || String(cause))); }
  };

  attempt('simulation stop', () => { if (stopSimulation) stopSimulation(); });
  // The old clock has persisted its final reading by now; remove it before any new clock can read it.
  clearClockSession(storage);
  resetStore();
  attempt('engine reset', () => {
    engine?.setInputEnabled?.(false);
    engine?.releasePointerLock?.();
    engine?.resetSession?.();
  });
  // Never create a second clock by accident: a new simulation needs a successful old stop callback too.
  const canStartSimulation = typeof startSimulation === 'function' && typeof stopSimulation === 'function' && !problems.some((p) => p.startsWith('simulation stop:'));
  if (startSimulation && !canStartSimulation) problems.push('simulation restart needs a successful stopSimulation and startSimulation');
  attempt('simulation start', () => { if (canStartSimulation) startSimulation(); });
  // The start is synchronous; pausing here means the new clock never advances on the start screen.
  pauseMission();

  return {
    ok: problems.length === 0,
    message: problems.length ? problems.join('; ') : null,
    startedAtMs: useMissionStore.getState().mission.startedAtMs,
  };
}
