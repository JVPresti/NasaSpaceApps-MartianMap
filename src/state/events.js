// Event runner: loads the event data files, ticks the event engine from mission
// time and turns a planner request into a new route in the store.
//
// Plain JavaScript (no React, no three.js). The browser pieces it needs are
// `fetch` (through src/data/dataFiles.js), `Worker` (through createRoutePlannerClient) and the mission store.
import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenCaution from '../sim/events/low-oxygen-caution.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';
import { createEventEngine } from '../sim/eventEngine.js';
import { MISSION_SOURCES, missionEventDefinitions, missionForObjective } from '../sim/missions.js';
import { HAZARDS_PATH, provenance } from '../data/provenance.js';
import { loadCostGrid, loadDataFile } from '../data/dataFiles.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { heightAt } from '../sim/costGrid.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { suitConstantsFromHazards, walkCost } from '../sim/suitModel.js';
import { createStoreAdapter, useMissionStore } from './store.js';
import { truePosition } from '../sim/navigation.js';
import { ARRIVAL_RADIUS_M } from '../sim/waypointRunner.js';

// What each event is. When the storm and the radiation alert start, and how fast their timelines run, comes from the
// mission the crew's objective defines (src/sim/missions.js, #265).
const EVENT_DEFINITIONS = [dustStorm, radiation, lowOxygenCaution, lowOxygenWarning];

// The event times of each mission are SIM (#265): their notes are in the registry, next to the event values.
provenance.define(MISSION_SOURCES);

const ROUTE_SOURCES = {
  'route.path': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.distanceM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.climbM': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.steepestSlopeDeg': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
  'route.etaSec': { tag: 'DERIVED', source: 'suit model · hazards.json' },
};

// Sources for the environment values the event timelines write (#189). The HUD shows an environment value only once
// its path has a source, so every event write registers one.
export const EVENT_ENVIRONMENT_SOURCES = Object.freeze({
  'environment.dustOpacity': Object.freeze({
    tag: 'DERIVED',
    label: 'Dust storm model',
    source: 'dust storm event: tau from clear season 0.45 (Jezero) to the 2018 global storm 8.0 (Gale, not Jezero), hazards.json; ramp timing SIM',
  }),
  'environment.doseRateUgyH': Object.freeze({
    tag: 'DATA',
    label: 'RAD · Curiosity (Gale)',
    source: 'radiation event: RAD B dose rate of the September 2017 solar particle event, hazards.json models.sep_2017_profile',
  }),
});

/**
 * The event engine's store adapter, with a source written next to every environment value an event sets.
 * @param {typeof useMissionStore} store
 * @param {Record<string, object>} [sourcesByPath]
 */
/**
 * The environment sources for one mission. The first mission runs the same values on a shorter clock, and says so.
 * @param {'first' | 'full'} missionId
 */
export function eventEnvironmentSources(missionId) {
  if (missionId !== 'first') return EVENT_ENVIRONMENT_SOURCES;
  const dust = EVENT_ENVIRONMENT_SOURCES['environment.dustOpacity'];
  const dose = EVENT_ENVIRONMENT_SOURCES['environment.doseRateUgyH'];
  return Object.freeze({
    'environment.dustOpacity': Object.freeze({ ...dust, source: dust.source + '; first mission: ramp compressed from 90 s to 30 s (SIM)' }),
    'environment.doseRateUgyH': Object.freeze({ ...dose, source: dose.source + '; first mission: the profile compressed to 1 minute (SIM)' }),
  });
}

export function createEventStoreAdapter(store, sourcesByPath = EVENT_ENVIRONMENT_SOURCES) {
  const adapter = createStoreAdapter(store);
  return {
    ...adapter,
    set(path, value) {
      adapter.set(path, value);
      const source = sourcesByPath[path];
      if (source && store.getState().sources[path] !== source) {
        store.setState((state) => ({ sources: { ...state.sources, [path]: source } }));
      }
    },
  };
}

let current = null;

/**
 * Where each planned stop is, by stops.json id (`stopId` on the planner's waypoints), and how close counts as reaching
 * it: the waypoint runner's arrival radius. The event runner reads it from the route locked at Begin EVA, so the first
 * mission's storm waits for the sortie stop itself, not for whatever waypoint comes next (R5).
 * @param {{ waypoints?: Array<{ stopId?: string, x: number, z: number }> }} route
 * @returns {Record<string, { x: number, z: number, radius: number }>}
 */
export function plannedStops(route) {
  const stops = {};
  for (const waypoint of route?.waypoints ?? []) {
    if (waypoint?.stopId && Number.isFinite(waypoint.x) && Number.isFinite(waypoint.z) && !stops[waypoint.stopId]) {
      stops[waypoint.stopId] = { x: waypoint.x, z: waypoint.z, radius: ARRIVAL_RADIUS_M };
    }
  }
  return stops;
}

/** The habitat entry of shelters.json, the shelter of every event that re-plans to the habitat. */
const isHabitat = (shelter) => shelter?.id === 'HAB';

function loadPlanner() {
  return Promise.all([
    loadCostGrid(),
    loadDataFile(HAZARDS_PATH),
    loadDataFile(SHELTERS_PATH),
  ]).then(async ([grid, hazards, sheltersJson]) => {
    const client = createRoutePlannerClient();
    await client.setGrid(grid);
    return {
      client,
      heightAt: (x, z) => heightAt(grid, x, z),
      constants: suitConstantsFromHazards(hazards),
      shelters: sheltersJson.shelters
        .filter((shelter) => Number.isFinite(shelter.x) && Number.isFinite(shelter.z))
        .map((shelter) => ({ id: shelter.id, name: shelter.name, type: shelter.type, protection: shelter.protection, x: shelter.x, z: shelter.z })),
    };
  });
}

// `shelter` is the shelters.json entry the planner chose. The waypoint runner, the HUD and the engine highlight all
// target it while it is set; the event's end clears it (endEventRoute below).
export function writeRoute(store, result, reason, shelter = null) {
  store.setState((state) => {
    if (!result.ok) {
      return {
        route: { ...state.route, path: null, reason: result.detail ?? reason, decision: 'pending', skipped: [], shelter: null },
      };
    }
    const targetName = result.target?.name;
    // The stops the shelter route leaves out: not the target, not the habitat, and not a stop already reached (#265: the
    // first mission's storm starts after the crew has been at its only stop, which is visited, not skipped).
    const visited = new Set(Array.isArray(state.route.visited) ? state.route.visited : []);
    const skipped = state.route.waypoints
      .filter((waypoint) => waypoint.name !== targetName && waypoint.name !== 'HAB' && !visited.has(waypoint.name))
      .map((waypoint) => waypoint.name);
    return {
      route: {
        ...state.route,
        path: result.path,
        distanceM: result.distance,
        climbM: result.climb,
        steepestSlopeDeg: result.steepestSlopeDeg,
        etaSec: result.etaSec ?? null,
        reason: reason ?? result.reason,
        decision: 'pending',
        skipped,
        shelter,
      },
      sources: { ...state.sources, ...ROUTE_SOURCES },
    };
  });
}

/**
 * Start the event engine. Called by startSimulation after the engine is ready.
 *
 * Mission time comes from the store (`mission.elapsedSec`), which the #59 clock has already frozen on pause and
 * scaled by `mission.timeScale`. The event engine therefore stops advancing while the mission is paused; it no
 * longer reads wall time on its own.
 *
 * `onEventLog` receives the event engine's start/end entries with their label, for the EVA history (#43). The
 * runner still calls endEventRoute first, so the route cleanup after an event is unchanged.
 *
 * The mission comes from `objective` (the crew's objective, locked at Begin EVA: src/state/simulation.js passes it),
 * else from the store's `needs.objective`. It is read once, here: a later change of the needs changes nothing.
 *
 * @param {{ store?: object, objective?: string, setInterval?: Function, clearInterval?: Function,
 *   onEventLog?: (entry: { type: 'start' | 'end', eventId: string, label: string, missionTimeSec: number }) => void }} [options]
 * @returns {{ mission: 'first' | 'full', tick: () => void, stop: () => void, fire: (id: string) => boolean,
 *   listEvents: () => Array<object> }}
 */
export function startEventRunner({ store = useMissionStore, objective, setInterval: si = setInterval, clearInterval: ci = clearInterval, onEventLog } = {}) {
  const lockedObjective = objective ?? store.getState().needs?.objective;
  const mission = missionForObjective(lockedObjective);
  const definitions = missionEventDefinitions(lockedObjective, EVENT_DEFINITIONS, { stops: plannedStops(store.getState().route) });
  let stopped = false;
  let planner = null;
  let plannerPromise = null;

  const missionTime = () => {
    const elapsed = store.getState().mission?.elapsedSec;
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
  };

  const getPlanner = () => {
    if (!plannerPromise) plannerPromise = loadPlanner();
    return plannerPromise;
  };

  const requestReplan = ({ eventId, target, reason }) => {
    const state = store.getState();
    // The route leads home from where the astronaut really is (#42), not from the estimate.
    const truth = truePosition(state.navigation);
    const from = {
      x: Number.isFinite(truth.x) ? truth.x : 520,
      z: Number.isFinite(truth.z) ? truth.z : 600,
    };
    getPlanner()
      .then((service) => {
        planner = service;
        const shelters = target === 'habitat'
          ? service.shelters.filter((shelter) => shelter.id === 'HAB')
          : service.shelters;
        return service.client.replan({ from, shelters, options: { reason } });
      })
      .then((result) => {
        // The planner answers asynchronously. An event that ended meanwhile no longer owns the route, so its late
        // answer writes nothing: no path, no skipped stops, no shelter over another event's.
        if (!stillActive(eventId)) return;
        if (!result.ok) {
          writeRoute(store, result, reason);
          return;
        }
        const walk = walkCost(result.path, planner.heightAt, planner.constants);
        const shelter = planner.shelters.find((entry) => entry.id === result.target?.id) ?? result.target;
        writeRoute(store, { ...result, etaSec: walk.timeSec }, `${reason} (${eventId})`, shelter);
      })
      .catch((error) => {
        if (!stillActive(eventId)) return;
        // A failed planner must not leave a stale route looking safe.
        writeRoute(store, { ok: false, detail: error instanceof Error ? error.message : String(error) }, reason);
      });
  };

  const stillActive = (eventId) => !stopped && store.getState().eva?.phase !== 'ended' && engine.getActive().some((active) => active.id === eventId);

  const sheltered = () => engine.getActive().some((active) => definitions.find((event) => event.id === active.id)?.planner);

  // Once no event with a planner block is active, the event route is over.
  // - A route home to the habitat stays the target until the crew is inside the habitat (eva.atHabitat), and the stops
  //   it left out stay skipped: the events end 25 m out, and resuming the plan there sent the guidance back to the stop
  //   while the path led home (P5). The tick below lets the habitat go once the crew is in.
  // - A route to another shelter ends there: the shelter and the skipped list clear, and the planned waypoints resume
  //   from route.nextIndex.
  const endEventRoute = ({ type }) => {
    if (type !== 'end' || sheltered()) return;
    const state = store.getState();
    const route = state.route;
    if (!route.shelter && !route.skipped?.length) return;
    if (isHabitat(route.shelter)) {
      if (state.eva?.atHabitat === true) store.setState((s) => ({ route: { ...s.route, shelter: null } }));
      return;
    }
    store.setState((s) => ({ route: { ...s.route, shelter: null, skipped: [] } }));
  };

  // Home: the habitat stops being the target once the crew is inside it, after the events that sent them there ended.
  const releaseHome = (state) => {
    if (isHabitat(state.route?.shelter) && state.eva?.atHabitat === true && !sheltered()) {
      store.setState((s) => ({ route: { ...s.route, shelter: null } }));
    }
  };

  const labels = new Map(definitions.map((definition) => [definition.id, definition.label]));
  const log = (entry) => {
    endEventRoute(entry);
    if (typeof onEventLog === 'function') {
      onEventLog({ ...entry, label: labels.get(entry.eventId) ?? entry.eventId });
    }
  };

  // Events switched off at the mission table (#11) are left out of this EVA.
  const off = store.getState().hazards?.off ?? [];
  const engine = createEventEngine({
    events: definitions.filter((event) => !off.includes(event.id)),
    store: createEventStoreAdapter(store, eventEnvironmentSources(mission.id)),
    getMissionTime: missionTime,
    requestReplan,
    log,
  });

  const tick = () => {
    if (stopped) return;
    const state = store.getState();
    const truth = truePosition(state.navigation);
    const position = Number.isFinite(truth.x) && Number.isFinite(truth.z) ? truth : undefined;
    engine.update(missionTime(), position);
    releaseHome(store.getState());
  };

  const timer = si(tick, 1000);
  tick();

  const runner = {
    mission: mission.id,
    tick,
    fire: (id) => engine.fire(id),
    listEvents: () => engine.listEvents(),
    stop: () => {
      if (stopped) return;
      stopped = true;
      ci(timer);
      if (current === runner) current = null;
      if (planner) planner.client.terminate();
      else if (plannerPromise) plannerPromise.then((service) => service.client.terminate()).catch(() => {});
    },
  };
  current = runner;
  return runner;
}

/** Debug/demo control: start any registered event, whatever its trigger. */
export function fireEvent(id) {
  return current ? current.fire(id) : false;
}

/** Events available to the debug control, with the triggers of the running mission (or of the objective chosen now). */
export function listEvents() {
  if (current) return current.listEvents();
  return missionEventDefinitions(useMissionStore.getState().needs?.objective, EVENT_DEFINITIONS)
    .map((event) => ({ id: event.id, label: event.label, trigger: event.trigger }));
}
