// Starts the simulation modules that write the mission store. Called by EngineView once the engine is ready.
// Today: the mission clock (#59), the suit model (#19), the per-leg route costs (#41), events and the EVA statistics
// (#43), plus the partner (#70). Navigation joins here as it lands.
import { useMissionStore } from './store.js';
import { DEMO_MISSION_CLOCK, SKY_PRESETS, startMissionClock } from '../sim/missionClock.js';
import { startEventRunner } from './events.js';
import { recordEvaEvent, startEvaRunner } from './eva.js';
import { startOffRoute } from './offRoute.js';
import { startSlopeDetourService } from './slopeDetour.js';
import { startWaypointRunner } from '../sim/waypointRunner.js';
import { loadStops } from '../data/stops.js';
import { parseShelters } from '../sim/shelters.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { startSuitRunner } from '../sim/suitRunner.js';
import { startPartnerRunner } from '../sim/partnerRunner.js';
import { legCostSources, startLegCostRunner } from '../sim/legCosts.js';
import { initNavigation } from '../sim/navigation.js';

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
  const events = startEventRunner({
    store: useMissionStore,
    onEventLog: (entry) => recordEvaEvent(useMissionStore, entry),
  });
  const offRoute = startOffRoute({ store: useMissionStore });
  const waypoints = startWaypointRunner({ store: useMissionStore });
  const slopeDetour = startSlopeDetourService();
  // Science stop radii (arrival_radius in stops.json). Until the file loads every waypoint uses 5 m.
  loadStops().then((stops) => waypoints.setStops(stops)).catch((e) => console.error('stops.json not loaded, arrival radius 5 m:', e));
  let stopped = false, suit = null, legs = null, clock = null, eva = null, partner = null;

  // The clock starts from its own timestamp and does not wait for hazards.json. A slow or failed hazard
  // fetch must not stop the EVA timer.
  try {
    clock = startMissionClock({ store: useMissionStore, config: { sky: initialSky(useMissionStore.getState()) } });
  } catch (e) {
    console.error('mission clock not started:', e);
  }
  initNavigation({ store: useMissionStore });   // a terrain fix now, fixed error until the drift model (#42); after the clock, for the fix time

  // The habitat entry is the first shelter in the real file (the foot of the airlock steps). It is not the HAB
  // route waypoint. The EVA runner waits for this fetch, and a stopped simulation never starts it from a late answer.
  const habitat = fetch(SHELTERS_URL)
    .then((r) => { if (!r.ok) throw new Error('shelters.json ' + r.status); return r.json(); })
    .then((data) => parseShelters(data)[0])
    .catch((e) => {
      console.error('shelters.json not loaded, EVA statistics not started:', e);
      return null;
    });

  habitat
    .then((entry) => {
      if (stopped || !entry) return;
      try {
        eva = startEvaRunner({ store: useMissionStore, habitat: { x: entry.x, z: entry.z } });
      } catch (e) {
        console.error('EVA statistics not started:', e);
      }
    })
    .catch((e) => console.error('EVA statistics not started:', e));

  Promise.all([
    fetch(HAZARDS_URL).then((r) => { if (!r.ok) throw new Error('hazards.json ' + r.status); return r.json(); }),
    habitat,
  ])
    .then(([hazards, shelter]) => {
      if (stopped) return;
      const constants = suitConstantsFromHazards(hazards);
      suit = startSuitRunner({ store: useMissionStore, heightAt: engine.heightAt, constants, habitat: shelter ?? undefined });
      legs = startLegCostRunner({ store: useMissionStore, heightAt: engine.heightAt, constants, sources: legCostSources(hazards) });
      // the partner's suit and the separation limit (#70), read only through the partner source
      if (engine.getPartner) partner = startPartnerRunner({ store: useMissionStore, readPartner: engine.getPartner, heightAt: engine.heightAt, lineOfSight: engine.lineOfSight, constants, habitat: shelter ?? undefined });
    })
    .catch((e) => console.error('suit model not started:', e));
  return () => {
    stopped = true;
    if (clock) clock.stop();
    events.stop();
    offRoute.stop();
    waypoints.stop();
    slopeDetour.stop();
    if (eva) eva.stop();
    if (suit) suit.stop();
    if (legs) legs.stop();
    if (partner) partner.stop();
  };
}
