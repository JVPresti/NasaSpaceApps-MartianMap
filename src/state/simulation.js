// Starts the simulation modules that write the mission store. Called by EngineView once the engine is ready.
// Today: the mission clock (#59), the suit model (#19), the per-leg route costs (#41), events and the EVA statistics
// (#43), plus the partner (#70). Navigation joins here as it lands.
//
// Two phases (#166). The app opens in Plan mode, at the habitat's planning table: only the clock (for the Plan top bar)
// and the per-leg costs run. The EVA starts on the first switch to Walk, with the astronaut at the airlock (the engine
// places them there, src/engine/spawn.js): a fresh clock, full consumables, a fresh terrain fix, WP1 as the next target,
// and the walkback, partner, off-route, waypoint, event and EVA statistics runners. Later switches between Plan and Walk
// change nothing here.
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
 * The route at the start of an EVA. The first waypoint is where the route starts, the habitat (HAB in route.json),
 * so it counts as reached and the next target is the second one, WP1. Without that the waypoint runner and the
 * off-route re-planner would send the crew to the HAB waypoint, 30 m from the airlock, before anything else.
 * @param {{ waypoints?: Array<{ name?: string }>, nextIndex?: number, visited?: string[] }} route
 */
export function departRoute(route) {
  const first = Array.isArray(route?.waypoints) ? route.waypoints[0] : undefined;
  return { ...route, nextIndex: 1, visited: first?.name ? [first.name] : [] };
}

/**
 * @param {{ heightAt: (x: number, z: number) => number }} engine
 * @param {{ mock?: boolean, store?: typeof useMissionStore }} [options] with mock data loaded (?mock=1) nothing starts, so the mock values stay put
 * @returns {() => void} stop
 */
export function startSimulation(engine, { mock = false, store = useMissionStore } = {}) {
  if (mock) return () => {};
  const slopeDetour = startSlopeDetourService();
  const stopsReady = loadStops().catch((e) => { console.error('stops.json not loaded, arrival radius 5 m:', e); return null; });
  let stopped = false, suit = null, legs = null, clock = null, eva = null, partner = null;

  const startClock = (restore) => {
    try {
      clock = startMissionClock({ store, restore, config: { sky: initialSky(store.getState()) } });
    } catch (e) {
      clock = null;
      console.error('mission clock not started:', e);
    }
  };
  // The clock starts from its own timestamp and does not wait for hazards.json. A slow or failed hazard
  // fetch must not stop the EVA timer.
  startClock(true);

  const shelters = fetch(SHELTERS_URL)
    .then((r) => { if (!r.ok) throw new Error('shelters.json ' + r.status); return r.json(); })
    .catch(() => null);
  // The habitat entry is the first shelter in the real file (the foot of the airlock steps), not the HAB route waypoint.
  // null when the file is missing or invalid: the suit runner then uses its DEFAULT_HABITAT and the EVA statistics do not start.
  const habitatEntry = shelters.then((data) => {
    try {
      return data ? parseShelters(data)[0] ?? null : null;
    } catch {
      return null;
    }
  });

  const suitData = Promise.all([
    fetch(HAZARDS_URL).then((r) => { if (!r.ok) throw new Error('hazards.json ' + r.status); return r.json(); }),
    habitatEntry,
  ])
    .then(([hazards, entry]) => {
      const constants = suitConstantsFromHazards(hazards);
      const habitat = entry ?? undefined;   // DEFAULT_HABITAT in the suit runner remains the fallback
      if (!stopped) legs = startLegCostRunner({ store, heightAt: engine.heightAt, constants, sources: legCostSources(hazards) });
      return { constants, habitat };
    });
  suitData.catch((e) => console.error('suit model not started:', e));

  // The EVA: everything that reads the astronaut's position or the mission time starts here, from zero.
  function startEva() {
    // A new clock session: EVA 0:00 at the airlock. The new mission.startedAtMs also clears the boot prints (engineBridge).
    // A paused mission (the start screen or the pause menu, #64) stays paused: the new clock waits at 0:00.
    const paused = store.getState().mission.paused === true;
    if (clock) clock.stop();
    startClock(false);
    if (clock && paused) clock.pause();
    initNavigation({ store });   // a terrain fix at the airlock; after the clock, for the fix time
    store.setState((s) => ({ route: departRoute(s.route) }));
    const waypoints = startWaypointRunner({ store });
    stopsReady.then((stops) => { if (stops) waypoints.setStops(stops); });
    eva = {
      events: startEventRunner({ store, onEventLog: (entry) => recordEvaEvent(store, entry) }),
      offRoute: startOffRoute({ store }),
      waypoints,
      stats: null,
    };
    // The debrief statistics (#43): distance, minima and history from this EVA's clock, ended at the real HAB entry.
    habitatEntry.then((entry) => {
      if (stopped) return;
      if (!entry) { console.error('shelters.json not loaded, EVA statistics not started'); return; }
      try {
        eva.stats = startEvaRunner({ store, habitat: { x: entry.x, z: entry.z } });
      } catch (e) {
        console.error('EVA statistics not started:', e);
      }
    });
    suitData.then(({ constants, habitat }) => {
      if (stopped) return;
      suit = startSuitRunner({ store, heightAt: engine.heightAt, constants, habitat });   // full O2 and battery
      // the partner's suit and the separation limit (#70), read only through the partner source
      if (engine.getPartner) partner = startPartnerRunner({ store, readPartner: engine.getPartner, heightAt: engine.heightAt, lineOfSight: engine.lineOfSight, constants, habitat });
    }, () => {});
  }

  const onMode = (s) => { if (s.mode === 'walk' && !eva && !stopped) { unsubscribe(); startEva(); } };
  const unsubscribe = store.subscribe(onMode);
  onMode(store.getState());

  return () => {
    stopped = true;
    unsubscribe();
    if (clock) clock.stop();
    slopeDetour.stop();
    if (eva) { eva.events.stop(); eva.offRoute.stop(); eva.waypoints.stop(); if (eva.stats) eva.stats.stop(); }
    if (suit) suit.stop();
    if (legs) legs.stop();
    if (partner) partner.stop();
  };
}
