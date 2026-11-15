/**
 * Runs the suit model against the mission store a few times per second.
 *
 * Reads the player's true position (navigation.trueX/trueZ, #42) and the planned route from the store, measures
 * speed and gradient between ticks, steps the consumables, and writes the suit section back. Time comes from
 * timestamps (`now()`), never from adding up frame times; ticks while the mission is paused consume nothing.
 *
 * Plain JavaScript: the store is any object with getState / setState (the Zustand store in src/state/store.js),
 * and the terrain is a heightAt(x, z) function (the engine's query). No React, no three.js.
 */
import { createSuitState, pathHome, pathToShelter, stepSuit, suitReadout, walkCost } from './suitModel.js';
import { DEFAULT_HABITAT } from './replan.js';
import { truePosition } from './navigation.js';

export const SUIT_TICK_MS = 250;

const shelterOf = (route) => {
  const sh = route?.shelter;
  return sh && Number.isFinite(sh.x) && Number.isFinite(sh.z) ? sh : null;
};

/**
 * The suit state at the airlock: full tank and battery, or the O2 (g) and battery (Wh) the crew set at the mission
 * table (needs.o2Pct and needs.batteryPct through legCosts.startConsumables), so the walk matches the plan.
 * @param {object} c suit constants
 * @param {{ o2G?: number, batteryWh?: number }} [start]
 */
export function startSuitState(c, start = {}) {
  const suit = createSuitState(c);
  const within = (value, max) => (Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : max);
  return { ...suit, o2G: within(start?.o2G, suit.o2G), batteryWh: within(start?.batteryWh, suit.batteryWh) };
}

/**
 * @param {{ store: { getState: Function, setState: Function }, heightAt: (x: number, z: number) => number,
 *   constants: object, habitat?: { x: number, z: number }, start?: { o2G?: number, batteryWh?: number },
 *   now?: () => number, setInterval?: Function, clearInterval?: Function }} options
 *   start: the consumables at the airlock (startSuitState); full when left out
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startSuitRunner({ store, heightAt, constants: c, habitat = DEFAULT_HABITAT, start, now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let suit = startSuitState(c, start);
  let last = null;                    // { t, x, z } at the previous tick
  let speed = 0, gradient = 0;        // smoothed over about a second: positions arrive at 5 Hz and ticks at 4 Hz
  let walkback = { timeSec: 0, o2G: 0, distanceM: 0 }, walkbackKey = '', walkbackTo = 'habitat';

  store.setState((s) => ({ sources: { ...s.sources, ...c.sources } }));

  function tick() {
    const s = store.getState(), t = now(), nav = s.navigation;
    const p = truePosition(nav);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { last = null; return; }   // engine not reporting yet
    if (last) {
      const dtSec = Math.min(1, Math.max(0, (t - last.t) / 1000));
      if (dtSec > 0 && !s.mission.paused) {
        const run = Math.hypot(p.x - last.x, p.z - last.z), k = Math.min(1, dtSec / 1);
        speed += (run / dtSec - speed) * k;
        if (run > 0.05) gradient += ((heightAt(p.x, p.z) - heightAt(last.x, last.z)) / run - gradient) * k;
        suit = stepSuit(suit, { dtSec, speedMs: speed, gradient }, c);
      }
    }
    last = { t, x: p.x, z: p.z };

    // walkback: recompute when the player moved a metre or the route changed. During an event the route leads from
    // the player to route.shelter, so the walkback follows it forward to the shelter instead of back to its start.
    const shelter = shelterOf(s.route);
    const key = Math.round(p.x) + ',' + Math.round(p.z) + ',' + (s.route.path ? s.route.path.length + ':' + s.route.path[0] : 'none')
      + ',' + (shelter ? shelter.x + ':' + shelter.z : 'home');
    if (key !== walkbackKey) {
      walkbackKey = key;
      walkbackTo = shelter ? 'shelter' : 'habitat';
      const path = shelter ? pathToShelter(p, s.route.path, shelter) : pathHome(p, s.route.path, habitat);
      walkback = walkCost(path, heightAt, c);
    }

    const r = suitReadout(suit, walkback, c, { elapsedSec: s.mission.elapsedSec });
    store.setState((st) => ({ suit: { ...st.suit, ...r, walkbackTo } }));
  }

  const timer = si(tick, SUIT_TICK_MS);
  return { tick, stop: () => ci(timer) };
}
