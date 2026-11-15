// The presentation's contract with the page around it (#291): which keys it takes, how it gives the engine back, how
// long it waits for the engine, and the URLs in and out. Kept out of Present.jsx so tests can run it without a browser.
import { dustLevelFromTau } from '../state/dustLevel.js';
import { missionSolarHours } from '../state/skyTime.js';

const NEXT = new Set(['ArrowRight', 'PageDown', ' ', 'Enter', 'Spacebar']);
const BACK = new Set(['ArrowLeft', 'PageUp']);
// Keys the browser keeps while presenting: reload, full screen and the developer tools.
const BROWSER = new Set(['F5', 'F11', 'F12']);

/** Query keys that belong to the presentation and go when it ends. ?tier and ?lang stay: the app reads them too. */
export const PRESENT_KEYS = ['present', 'autoplay', 'record', 'seq', 'beat', 'live'];

/** The engine has this long to boot before the presentation drops to its caption fallback. */
export const ENGINE_TIMEOUT_MS = 20_000;

/**
 * What a key does while presenting: 'next', 'back', 'exit', 'lang', 'swallow' or null.
 * 'swallow' means the key is not the presentation's but must not reach the app either: G would toggle the slope grid
 * and WASD would walk the camera under the cinematic. Null leaves the key to the browser (modifiers, F5, F11, F12).
 */
export function presentKey(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const k = e.key;
  if (BROWSER.has(k)) return null;
  if (NEXT.has(k)) return 'next';
  if (BACK.has(k)) return 'back';
  if (k === 'Escape') return 'exit';
  if (k === 'l' || k === 'L') return 'lang';
  return 'swallow';
}

/**
 * Puts back what the presentation changed on the engine, from the mission store. engineBridge only writes when the
 * store changes, so the presentation re-applies the store's sky, layer, slope grid and dust itself: the live demo opens
 * in the store's light (late_afternoon by default, #59), not the presentation's.
 */
export function restoreEngine(engine, state) {
  if (!engine || !state) return;
  const v = state.view || {};
  const call = (name, ...args) => { try { engine[name]?.(...args); } catch { /* engine not ready */ } };
  call('setDust', dustLevelFromTau(state.environment?.dustOpacity ?? 0));
  call('setSky', v.sky);
  if ((v.skyBlend ?? 0) > 0) call('setSkyBlend', v.sky, 'dust_storm', v.skyBlend);
  if (state.mission) call('setSkyTime', missionSolarHours(state.mission));
  call('setLayer', v.layer ?? 0);
  call('setSlopeGrid', !!v.slopeGrid);
}

/**
 * Counts how long the show has held for the engine. update(hold, nowMs) returns true once one hold has lasted
 * timeoutMs; a hold that ends resets it.
 */
export function createHoldTimer(timeoutMs = ENGINE_TIMEOUT_MS) {
  let since = null;
  return {
    update(hold, nowMs) {
      if (!hold) { since = null; return false; }
      if (since === null) since = nowMs;
      return nowMs - since >= timeoutMs;
    },
  };
}

/** The page's query string without the presentation's keys, for history.replaceState when it ends. */
export function queryWithoutPresent(search) {
  const q = new URLSearchParams(search);
  for (const k of PRESENT_KEYS) q.delete(k);
  const qs = q.toString();
  return qs ? '?' + qs : '';
}

/** The start screen's link into the presentation, keeping the page's other keys (?tier, ?lang). */
export function presentHrefFor(search) {
  const q = new URLSearchParams(search);
  q.set('present', '1');
  return '?' + q.toString();
}

/**
 * The caption fallback's next beat for a 'next' or 'back' key. It stops on the last beat: the hand-off to the live app
 * needs the engine, which the fallback does not have.
 */
export function fallbackStep(index, action, count) {
  if (action === 'back') return Math.max(0, index - 1);
  if (action === 'next') return Math.min(count - 1, index + 1);
  return index;
}

/**
 * Who drives the beats: 'auto' (the beat lengths) or 'manual' (the presenter). The talk starts in auto; the first
 * manual step (a key, a clicker, a tap or a swipe) only takes over, so a video mid-beat keeps playing, and every step
 * after it moves the beats. input(action) returns the step to make, or null for the takeover itself.
 */
export function createPilot(auto = true) {
  let mode = auto ? 'auto' : 'manual';
  return {
    get mode() { return mode; },
    input(action) {
      if (action !== 'next' && action !== 'back') return action;
      if (mode === 'auto') { mode = 'manual'; return null; }
      return action;
    },
  };
}

/** A tap or swipe as a step: a swipe of 50 px or more left is next, right is back; a tap on the right half is next. */
export function pointerStep(down, up, width) {
  const dx = up.x - down.x, dy = up.y - down.y;
  if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'next' : 'back';
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return up.x >= width / 2 ? 'next' : 'back';
  return null;
}
