// Event runner: loads the event data files, ticks the event engine from mission
// time and turns a planner request into a new route in the store.
//
// Plain JavaScript (no React, no three.js). The browser pieces it needs are
// `fetch`, `Worker` (through createRoutePlannerClient) and the mission store.
import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenCaution from '../sim/events/low-oxygen-caution.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';
import { createEventEngine } from '../sim/eventEngine.js';
import { buildCostGrid, heightAt } from '../sim/costGrid.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { suitConstantsFromHazards, walkCost } from '../sim/suitModel.js';
import { createStoreAdapter, useMissionStore } from './store.js';
import { truePosition } from '../sim/navigation.js';

const TERRAIN_URL = import.meta.env.BASE_URL + 'marswalk/assets/terrain.json';
const HAZARDS_URL = import.meta.env.BASE_URL + 'data/hazards.json';
const SHELTERS_URL = import.meta.env.BASE_URL + 'data/shelters.json';

const EVENT_DEFINITIONS = [dustStorm, radiation, lowOxygenCaution, lowOxygenWarning];

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

function json(response, name) {
  if (!response.ok) throw new Error(`${name} ${response.status}`);
  return response.json();
}

function loadPlanner() {
  return Promise.all([
    fetch(TERRAIN_URL).then((response) => json(response, 'terrain.json')),
    fetch(HAZARDS_URL).then((response) => json(response, 'hazards.json')),
    fetch(SHELTERS_URL).then((response) => json(response, 'shelters.json')),
  ]).then(async ([terrainJson, hazards, sheltersJson]) => {
    const grid = buildCostGrid(terrainJson);
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
function writeRoute(store, result, reason, shelter = null) {
  store.setState((state) => {
    if (!result.ok) {
      return {
        route: { ...state.route, path: null, reason: result.detail ?? reason, decision: 'pending', skipped: [], shelter: null },
      };
    }
    const targetName = result.target?.name;
    const skipped = state.route.waypoints
      .filter((waypoint) => waypoint.name !== targetName && waypoint.name !== 'HAB')
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
 * @param {{ store?: object, setInterval?: Function, clearInterval?: Function,
 *   onEventLog?: (entry: { type: 'start' | 'end', eventId: string, label: string, missionTimeSec: number }) => void }} [options]
 * @returns {{ tick: () => void, stop: () => void, fire: (id: string) => boolean, listEvents: () => Array<object> }}
 */
export function startEventRunner({ store = useMissionStore, setInterval: si = setInterval, clearInterval: ci = clearInterval, onEventLog } = {}) {
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

  // Once no event with a planner block is active, the event route is over. The shelter and the skipped list clear,
  // and the runner resumes the planned waypoints from route.nextIndex.
  const endEventRoute = ({ type }) => {
    if (type !== 'end') return;
    const sheltered = engine.getActive().some((active) => EVENT_DEFINITIONS.find((event) => event.id === active.id)?.planner);
    const route = store.getState().route;
    if (sheltered || (!route.shelter && !route.skipped?.length)) return;
    store.setState((state) => ({ route: { ...state.route, shelter: null, skipped: [] } }));
  };

  const labels = new Map(EVENT_DEFINITIONS.map((definition) => [definition.id, definition.label]));
  const log = (entry) => {
    endEventRoute(entry);
    if (typeof onEventLog === 'function') {
      onEventLog({ ...entry, label: labels.get(entry.eventId) ?? entry.eventId });
    }
  };

  const engine = createEventEngine({
    events: EVENT_DEFINITIONS,
    store: createEventStoreAdapter(store),
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
  };

  const timer = si(tick, 1000);
  tick();

  const runner = {
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

/** Events available to the debug control. */
export function listEvents() {
  return current ? current.listEvents() : EVENT_DEFINITIONS.map((event) => ({ id: event.id, label: event.label, trigger: event.trigger }));
}
