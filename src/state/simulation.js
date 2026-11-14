// Starts the simulation modules that write the mission store. Called by EngineView once the engine is ready.
// Today: the mission clock (#59), the suit model (#19) and the per-leg route costs (#41). Navigation and events join here as they land.
import { useMissionStore } from './store.js';
import { DEMO_MISSION_CLOCK, SKY_PRESETS, startMissionClock } from '../sim/missionClock.js';
import { startEventRunner } from './events.js';
import { startOffRoute } from './offRoute.js';
import { parseShelters } from '../sim/shelters.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { startSuitRunner } from '../sim/suitRunner.js';
import { legCostSources, startLegCostRunner } from '../sim/legCosts.js';

const HAZARDS_URL = import.meta.env.BASE_URL + 'data/hazards.json';
const SHELTERS_URL = import.meta.env.BASE_URL + 'data/shelters.json';

// The clock may start from an alternate sky preset (?); it takes its coarse demo local start time.
function initialSky(state) {
  return SKY_PRESETS.includes(state.view.sky) ? state.view.sky : DEMO_MISSION_CLOCK.sky;
}

/**
 * @param {{ heightAt: (x: number, z: number) => number }} engine
 * @param {{ mock?: boolean }} [options] with mock data loaded (?mock=1) nothing starts, so the mock values stay put
 * @returns {() => void} stop
 */
export function startSimulation(engine, { mock = false } = {}) {
  if (mock) return () => {};
  const events = startEventRunner({ store: useMissionStore });
  const offRoute = startOffRoute({ store: useMissionStore });
  let stopped = false, suit = null, legs = null, clock = null;

  // The clock starts from its own timestamp and does not wait for hazards.json. A slow or failed hazard
  // fetch must not stop the EVA timer.
  try {
    clock = startMissionClock({ store: useMissionStore, config: { sky: initialSky(useMissionStore.getState()) } });
  } catch (e) {
    console.error('mission clock not started:', e);
  }

  const shelters = fetch(SHELTERS_URL)
    .then((r) => { if (!r.ok) throw new Error('shelters.json ' + r.status); return r.json(); })
    .catch(() => null);

  Promise.all([
    fetch(HAZARDS_URL).then((r) => { if (!r.ok) throw new Error('hazards.json ' + r.status); return r.json(); }),
    shelters,
  ])
    .then(([hazards, shelterData]) => {
      if (stopped) return;
      const constants = suitConstantsFromHazards(hazards);
      let habitat;
      try {
        habitat = shelterData ? parseShelters(shelterData)[0] : undefined;
      } catch {
        habitat = undefined;   // DEFAULT_HABITAT in the suit runner remains the fallback
      }
      suit = startSuitRunner({ store: useMissionStore, heightAt: engine.heightAt, constants, habitat });
      legs = startLegCostRunner({ store: useMissionStore, heightAt: engine.heightAt, constants, sources: legCostSources(hazards) });
    })
    .catch((e) => console.error('suit model not started:', e));
  return () => {
    stopped = true;
    if (clock) clock.stop();
    events.stop();
    offRoute.stop();
    if (suit) suit.stop();
    if (legs) legs.stop();
  };
}
