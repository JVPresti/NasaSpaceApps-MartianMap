// The presentation's contract with the page around it (#291): which keys it takes, how it gives the engine back, how
// long it waits for the engine, and the URLs in and out. Kept out of Present.jsx so tests can run it without a browser.
import { dustLevelFromTau } from '../state/dustLevel.js';
import { missionSolarHours } from '../state/skyTime.js';

const NEXT = new Set(['ArrowRight', 'PageDown', 'Enter']);
const TOGGLE = new Set([' ', 'Spacebar', 'p', 'P', 'k', 'K', 'MediaPlayPause']);
const BACK = new Set(['ArrowLeft', 'PageUp']);
// Keys the browser keeps while presenting: reload, full screen and the developer tools.
const BROWSER = new Set(['F5', 'F11', 'F12']);

/** Query keys that belong to the presentation and go when it ends. ?tier and ?lang stay: the app reads them too. */
export const PRESENT_KEYS = ['present', 'autoplay', 'record', 'seq', 'beat', 'live'];

/** The engine has this long to boot before the presentation drops to its caption fallback. */
export const ENGINE_TIMEOUT_MS = 20_000;

/**
 * What a key does while presenting: 'next', 'back', 'toggle' (play or pause), 'slide:N' (jump to slide N, from the
 * digit keys 1 to 9), 'exit', 'lang', 'swallow' or null.
 * 'swallow' means the key is not the presentation's but must not reach the app either: G would toggle the slope grid
 * and WASD would walk the camera under the cinematic. Null leaves the key to the browser (modifiers, F5, F11, F12).
 */
export function presentKey(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const k = e.key;
  if (BROWSER.has(k)) return null;
  if (NEXT.has(k)) return 'next';
  if (BACK.has(k)) return 'back';
  if (TOGGLE.has(k)) return 'toggle';
  if (/^[1-9]$/.test(k)) return 'slide:' + k;
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
 * Play or pause. The talk opens paused on its first frame, behind a Play button, and plays only when the presenter
 * starts it. Pausing freezes the beat clock and the demo video; next, back and the slide keys move the beats whether it
 * plays or not, and keep the play state.
 */
export function createPlayer(playing = false) {
  let on = !!playing, started = on;
  return {
    get playing() { return on; },
    /** The presenter has pressed Play at least once (the big Play button goes after that). */
    get started() { return started; },
    play() { on = true; started = true; },
    pause() { on = false; },
    toggle() { if (on) on = false; else { on = true; started = true; } return on; },
  };
}

/** A slide key's target index, clamped to the beats there are, or null for any other action. */
export function slideTarget(action, count) {
  const m = /^slide:(\d+)$/.exec(String(action));
  if (!m) return null;
  return Math.max(0, Math.min(count - 1, Number(m[1]) - 1));
}

/** A tap or swipe as a step: a swipe of 50 px or more left is next, right is back; a tap on the right half is next. */
export function pointerStep(down, up, width) {
  const dx = up.x - down.x, dy = up.y - down.y;
  if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'next' : 'back';
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return up.x >= width / 2 ? 'next' : 'back';
  return null;
}

/**
 * Where the demo video stands at beat time t: the frame to show, whether it plays, and its opacity. It plays from the
 * beat's start, holds its last frame once the file ends (a beat a little longer than the file never shows an ended or
 * rewound video), and fades out over the beat's last 0.6 s into the next beat.
 * @param {number} t beat seconds  @param {number} beatSec the beat's length  @param {number} fileSec the file's length
 */
export function videoFrame(t, beatSec, fileSec) {
  const end = Number.isFinite(fileSec) && fileSec > 0 ? fileSec : beatSec;
  const last = Math.max(0, end - 1 / 30);   // a frame before the end: browsers show black or the poster at `ended`
  const time = Math.max(0, Math.min(t, last));
  const playing = t < last && t < beatSec - 0.05;
  const fadeIn = Math.min(1, Math.max(0, t / 0.6));
  const fadeOut = Math.min(1, Math.max(0, (beatSec - t) / 0.6));
  return { time, playing, opacity: Math.min(fadeIn, fadeOut) };
}

/** The play state's words, beside the slide number. */
export const playLabel = (playing, lang) => (playing ? (lang === 'es' ? 'En curso' : 'Playing') : (lang === 'es' ? 'En pausa' : 'Paused'));
