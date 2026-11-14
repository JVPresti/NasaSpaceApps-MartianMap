/**
 * Runs the suit model against the mission store a few times per second.
 *
 * Reads the player's position (navigation.x/z) and the planned route from the store, measures speed and gradient
 * between ticks, steps the consumables, and writes the suit section back. Time comes from timestamps (`now()`),
 * never from adding up frame times; ticks while the mission is paused consume nothing.
 *
 * Plain JavaScript: the store is any object with getState / setState (the Zustand store in src/state/store.js),
 * and the terrain is a heightAt(x, z) function (the engine's query). No React, no three.js.
 */
import { createSuitState, pathHome, stepSuit, suitReadout, walkCost } from './suitModel.js';
import { DEFAULT_HABITAT } from './replan.js';

export const SUIT_TICK_MS = 250;

/**
 * @param {{ store: { getState: Function, setState: Function }, heightAt: (x: number, z: number) => number,
 *   constants: object, habitat?: { x: number, z: number }, now?: () => number,
 *   setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startSuitRunner({ store, heightAt, constants: c, habitat = DEFAULT_HABITAT, now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let suit = createSuitState(c);
  let last = null;                    // { t, x, z } at the previous tick
  let speed = 0, gradient = 0;        // smoothed over about a second: positions arrive at 5 Hz and ticks at 4 Hz
  let walkback = { timeSec: 0, o2G: 0, distanceM: 0 }, walkbackKey = '';

  store.setState((s) => ({ sources: { ...s.sources, ...c.sources } }));

  function tick() {
    const s = store.getState(), t = now(), nav = s.navigation;
    if (!Number.isFinite(nav.x) || !Number.isFinite(nav.z)) { last = null; return; }   // engine not reporting yet
    if (last) {
      const dtSec = Math.min(1, Math.max(0, (t - last.t) / 1000));
      if (dtSec > 0 && !s.mission.paused) {
        const run = Math.hypot(nav.x - last.x, nav.z - last.z), k = Math.min(1, dtSec / 1);
        speed += (run / dtSec - speed) * k;
        if (run > 0.05) gradient += ((heightAt(nav.x, nav.z) - heightAt(last.x, last.z)) / run - gradient) * k;
        suit = stepSuit(suit, { dtSec, speedMs: speed, gradient }, c);
      }
    }
    last = { t, x: nav.x, z: nav.z };

    // walkback: recompute when the player moved a metre or the route changed
    const key = Math.round(nav.x) + ',' + Math.round(nav.z) + ',' + (s.route.path ? s.route.path.length + ':' + s.route.path[0] : 'none');
    if (key !== walkbackKey) { walkbackKey = key; walkback = walkCost(pathHome(nav, s.route.path, habitat), heightAt, c); }

    const r = suitReadout(suit, walkback, c);
    store.setState((st) => ({ suit: { ...st.suit, ...r } }));
  }

  const timer = si(tick, SUIT_TICK_MS);
  return { tick, stop: () => ci(timer) };
}
