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
import { useMissionStore, storeAdapter } from './store.js';

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
        .map((shelter) => ({ id: shelter.id, name: shelter.name, x: shelter.x, z: shelter.z })),
    };
  });
}

function writeRoute(result, reason) {
  useMissionStore.setState((state) => {
    if (!result.ok) {
      return {
        route: { ...state.route, path: null, reason: result.detail ?? reason, decision: 'pending', skipped: [] },
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
      },
      sources: { ...state.sources, ...ROUTE_SOURCES },
    };
  });
}

/**
 * Start the event engine. Called by startSimulation after the engine is ready.
 * @param {{ store?: object, now?: () => number, setInterval?: Function, clearInterval?: Function }} [options]
 * @returns {{ tick: () => void, stop: () => void, fire: (id: string) => boolean, listEvents: () => Array<object> }}
 */
export function startEventRunner({ store = useMissionStore, now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval } = {}) {
  let stopped = false;
  let planner = null;
  let plannerPromise = null;

  let startedAtMs = store.getState().mission.startedAtMs;
  if (!Number.isFinite(startedAtMs)) {
    startedAtMs = now();
    store.setState((state) => ({ mission: { ...state.mission, startedAtMs } }));
  }
  const missionTime = () => Math.max(0, (now() - startedAtMs) / 1000);

  const getPlanner = () => {
    if (!plannerPromise) plannerPromise = loadPlanner();
    return plannerPromise;
  };

  const requestReplan = ({ eventId, target, reason }) => {
    const state = store.getState();
    const from = {
      x: Number.isFinite(state.navigation.x) ? state.navigation.x : 520,
      z: Number.isFinite(state.navigation.z) ? state.navigation.z : 600,
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
        if (!result.ok) {
          writeRoute(result, reason);
          return;
        }
        const walk = walkCost(result.path, planner.heightAt, planner.constants);
        writeRoute({ ...result, etaSec: walk.timeSec }, `${reason} (${eventId})`);
      })
      .catch((error) => {
        // A failed planner must not leave a stale route looking safe.
        writeRoute({ ok: false, detail: error instanceof Error ? error.message : String(error) }, reason);
      });
  };

  const engine = createEventEngine({
    events: EVENT_DEFINITIONS,
    store: storeAdapter,
    getMissionTime: missionTime,
    requestReplan,
  });

  const tick = () => {
    if (stopped) return;
    const state = store.getState();
    const position = Number.isFinite(state.navigation.x) && Number.isFinite(state.navigation.z)
      ? { x: state.navigation.x, z: state.navigation.z }
      : undefined;
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
