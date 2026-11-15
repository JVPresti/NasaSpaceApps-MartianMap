// Starts the simulation modules that write the mission store. Called by EngineView once the engine is ready.
// Today: the mission clock (#59), the suit model (#19), the per-leg route costs (#41), events and the EVA statistics
// (#43), the partner (#70) and the environment: MEDA weather replay and RAD dose (#189). Navigation joins here as it lands.
//
// Two phases (habitat-first flow, src/state/flow.js). The app opens with the astronaut inside the habitat: only the
// clock (held, for the local time) and the per-leg costs run while they walk around and plan at the mission table.
// The EVA starts when the stage becomes 'eva', at the end of the airlock cycle, with the astronaut already outside
// (the engine moved them there while the screen was dark, src/engine/spawn.js): a fresh clock, full consumables, a
// fresh terrain fix, WP1 as the next target, and the walkback, partner, off-route, waypoint, event, environment and EVA
// statistics runners. Nothing in the habitat can start them, so no event fires and no oxygen is used before the EVA.
import { useMissionStore } from './store.js';
import { DEMO_MISSION_CLOCK, SKY_PRESETS, startMissionClock } from '../sim/missionClock.js';
import { startEventRunner } from './events.js';
import { recordEvaEvent, startEvaRunner } from './eva.js';
import { startOffRoute } from './offRoute.js';
import { startSlopeDetourService } from './slopeDetour.js';
import { startWaypointRunner } from '../sim/waypointRunner.js';
import { loadStops } from '../data/stops.js';
import { parseShelters, SHELTERS_PATH } from '../sim/shelters.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { loadDataFile } from '../data/dataFiles.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { startSuitRunner } from '../sim/suitRunner.js';
import { startPartnerRunner } from '../sim/partnerRunner.js';
import { legCostSources, startLegCostRunner } from '../sim/legCosts.js';
import { initNavigation } from '../sim/navigation.js';
import { startNavigationDrift } from '../sim/navigationDrift.js';
import { startEnvironmentRunner } from '../sim/environmentRunner.js';
import { MEDA_SOL_PATH, parseMedaSol, parseRad, RAD_PATH } from '../data/medaRad.js';

// One parsed environment file through the shared loader (provenance reads the same files). null when it is missing
// or invalid, with the reason in the console.
function loadEnvironmentFile(path, name, parse) {
  return loadDataFile(path)
    .then(parse)
    .catch((e) => { console.warn(name + ' not loaded, its environment values stay empty:', e); return null; });
}

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
  let stopped = false, suit = null, legs = null, clock = null, eva = null, partner = null, environment = null, navigation = null;
  const environmentData = Promise.all([
    loadEnvironmentFile(MEDA_SOL_PATH, 'meda_sol.json', parseMedaSol),
    loadEnvironmentFile(RAD_PATH, 'rad.json', parseRad),
  ]);

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

  const shelters = loadDataFile(SHELTERS_PATH).catch(() => null);
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
    loadDataFile(HAZARDS_PATH),
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
    // The navigation drift (#42): the estimate follows the bridge's true position (navigation.trueX/trueZ) from
    // the start of the EVA on, and initNavigation's fresh fix at the airlock re-seeds it.
    navigation = startNavigationDrift({
      store,
      lineOfSight: engine.lineOfSight,
      getMast: () => (typeof engine.getHabitatMast === 'function' ? engine.getHabitatMast() : null),
    });
    store.setState((s) => ({ route: departRoute(s.route) }));
    const waypoints = startWaypointRunner({ store });
    stopsReady.then((stops) => { if (stops) waypoints.setStops(stops); });
    eva = {
      events: startEventRunner({ store, onEventLog: (entry) => recordEvaEvent(store, entry) }),
      offRoute: startOffRoute({ store }),
      waypoints,
      stats: null,
    };
    // Weather and dose of this EVA (#189): the HUD environment strip shows them with their tags.
    environmentData.then(([meda, rad]) => {
      if (stopped || (!meda && !rad)) return;
      environment = startEnvironmentRunner({ store, meda, rad });
    });
    // The debrief statistics (#43): distance, minima and history from this EVA's clock, ended at the real HAB entry.
    habitatEntry.then((entry) => {
      if (stopped) return;
      if (!entry) { console.error('shelters.json not loaded, EVA statistics not started'); return; }
      try {
        // the whole habitat counts as being back, not only the circle at the foot of the steps (#244)
        const habitatZoneAt = typeof engine.habitatZoneAt === 'function' ? (x, z) => engine.habitatZoneAt(x, z) : undefined;
        eva.stats = startEvaRunner({ store, habitat: { x: entry.x, z: entry.z }, habitatZoneAt });
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

  const onStage = (s) => { if (s.stage === 'eva' && !eva && !stopped) { unsubscribe(); startEva(); } };
  const unsubscribe = store.subscribe(onStage);
  onStage(store.getState());

  return () => {
    stopped = true;
    unsubscribe();
    if (clock) clock.stop();
    if (navigation) { navigation.stop(); navigation = null; }
    slopeDetour.stop();
    if (eva) { eva.events.stop(); eva.offRoute.stop(); eva.waypoints.stop(); if (eva.stats) eva.stats.stop(); }
    if (suit) suit.stop();
    if (legs) legs.stop();
    if (partner) partner.stop();
    if (environment) environment.stop();
  };
}
