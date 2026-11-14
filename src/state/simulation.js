// Starts the simulation modules that write the mission store. Called by EngineView once the engine is ready.
// Today: the suit model (#19). The mission clock, navigation and events join here as they land.
import { useMissionStore } from './store.js';
import { startEventRunner } from './events.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { startSuitRunner } from '../sim/suitRunner.js';

const HAZARDS_URL = import.meta.env.BASE_URL + 'data/hazards.json';

/**
 * @param {{ heightAt: (x: number, z: number) => number }} engine
 * @param {{ mock?: boolean }} [options] with mock data loaded (?mock=1) nothing starts, so the mock values stay put
 * @returns {() => void} stop
 */
export function startSimulation(engine, { mock = false } = {}) {
  if (mock) return () => {};
  const events = startEventRunner({ store: useMissionStore });
  let stopped = false, suit = null;
  fetch(HAZARDS_URL)
    .then((r) => { if (!r.ok) throw new Error('hazards.json ' + r.status); return r.json(); })
    .then((hazards) => {
      if (stopped) return;
      suit = startSuitRunner({ store: useMissionStore, heightAt: engine.heightAt, constants: suitConstantsFromHazards(hazards) });
    })
    .catch((e) => console.error('suit model not started:', e));
  return () => {
    stopped = true;
    events.stop();
    if (suit) suit.stop();
  };
}
