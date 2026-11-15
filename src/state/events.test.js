import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordEvaEvent } from './eva.js';
import { eventEnvironmentSources, listEvents, plannedStops, startEventRunner, writeRoute } from './events.js';
import { resetStore, setNeeds, useMissionStore } from './store.js';
import { provenance } from '../data/provenance.js';
import { MISSION_SOURCES } from '../sim/missions.js';
import { nextTarget, startWaypointRunner } from '../sim/waypointRunner.js';
import { allStops } from '../data/stops.js';
import { createArrivalTracker } from '../stops/content.js';
import stopsJson from '../../public/data/stops.json';
import { resetDataFiles } from '../data/dataFiles.js';
import { beginEgress } from './flow.js';

beforeEach(() => resetStore());

afterEach(() => {
  vi.unstubAllGlobals();
  resetDataFiles();
  vi.useRealTimers();
});

describe('event runner mission time', () => {
  it('uses mission.elapsedSec (pause and time scale aware), not wall time, and keeps start/end in the EVA history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    // The radiation event has a planner block; keep its lazy planner load pending, this test starts no worker.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    // The full EVA keeps the radiation alert at T+720 s (src/sim/missions.js).
    const runner = startEventRunner({
      store: useMissionStore,
      objective: 'cheyava',
      setInterval: () => 0,
      clearInterval: () => {},
      onEventLog: (entry) => recordEvaEvent(useMissionStore, entry),
    });

    // Twelve wall minutes would trigger the 720 s radiation event under the old wall-clock calculation.
    vi.setSystemTime(new Date('2026-11-14T12:12:00Z'));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toBeUndefined();
    expect(useMissionStore.getState().eva.events).toEqual([]);

    // Mission time is what the #59 clock publishes: paused and time-scaled.
    useMissionStore.setState((state) => ({ mission: { ...state.mission, elapsedSec: 720 } }));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toMatchObject({ eventId: 'radiation', active: true });
    expect(useMissionStore.getState().eva.events).toContainEqual({
      type: 'start',
      eventId: 'radiation',
      label: 'Radiation alert',
      atSec: 720,
    });

    // The radiation event ends within 25 m of the real HAB entry in shelters.json.
    useMissionStore.setState((state) => ({
      navigation: { ...state.navigation, x: 535.1, z: 574.1 },
      mission: { ...state.mission, elapsedSec: 800 },
    }));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toBeNull();
    expect(useMissionStore.getState().eva.events).toContainEqual({
      type: 'end',
      eventId: 'radiation',
      label: 'Radiation alert',
      atSec: 800,
    });

    runner.stop();
  });
});

// The airlock entry of shelters.json, the centre of both events' 25 m end area, and the first sortie stop (stops.json).
const AIRLOCK = { x: 535.1, z: 574.1 };
const STOP = { x: 493, z: 539 };
const HAB_WAYPOINT = { name: 'HAB', x: AIRLOCK.x, z: AIRLOCK.z };
const S1 = { name: 'S1 · light-toned patch', x: STOP.x, z: STOP.z, stopId: 'sortie', workSec: 120, required: true };
const HAB_SHELTER = { id: 'HAB', name: 'Habitat', type: 'habitat', protection: 'full', x: AIRLOCK.x, z: AIRLOCK.z };
/** A point `share` of the way from the stop to the airlock, and its distance from the airlock. */
const toward = (share) => ({ x: STOP.x + (AIRLOCK.x - STOP.x) * share, z: STOP.z + (AIRLOCK.z - STOP.z) * share });
const fromAirlock = (p) => Math.hypot(p.x - AIRLOCK.x, p.z - AIRLOCK.z);

/** The sortie as Begin EVA locks it: the planned waypoints (the stop with its stops.json id), the first stop next. */
function planSortie(waypoints = [HAB_WAYPOINT, S1]) {
  useMissionStore.setState((state) => ({ route: { ...state.route, waypoints, nextIndex: 1, visited: ['HAB'] } }));
}

function quietRunner(options = {}) {
  // Both events have a planner block; keep its lazy planner load pending, these tests start no worker.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  return startEventRunner({ store: useMissionStore, setInterval: () => 0, clearInterval: () => {}, ...options });
}

/** Move the clock and the crew; `sample: true` secures a sample where the crew stands (sampling.samples keeps x, z). */
function at(elapsedSec, position, { sample = false, route } = {}) {
  useMissionStore.setState((state) => ({
    mission: { ...state.mission, elapsedSec },
    navigation: { ...state.navigation, x: position.x, z: position.z },
    ...(sample ? {
      sampling: {
        ...state.sampling,
        count: state.sampling.count + 1,
        samples: [...state.sampling.samples, { id: `s${state.sampling.count + 1}`, kind: 'soil', x: position.x + 1, z: position.z, atSec: elapsedSec }],
      },
    } : {}),
    ...(route ? { route: { ...state.route, ...route } } : {}),
  }));
}

const activeAlerts = () => Object.values(useMissionStore.getState().alerts).filter((alert) => alert?.active).map((alert) => alert.eventId);
const startedAt = (id) => useMissionStore.getState().eva.events.find((e) => e.type === 'start' && e.eventId === id)?.atSec ?? null;

function loggedRunner(options = {}) {
  return quietRunner({ onEventLog: (entry) => recordEvaEvent(useMissionStore, entry), ...options });
}

describe('event runner missions (#265)', () => {
  it('runs the first mission: the storm once a sample is secured at the stop, the radiation alert 15 s later', () => {
    planSortie();
    const runner = quietRunner();
    expect(runner.mission).toBe('first');

    at(10, toward(0.6)); runner.tick();
    at(55, STOP); runner.tick();                     // at the stop at T+55 s
    at(70, STOP); runner.tick();
    expect(activeAlerts()).toEqual([]);              // sampling: the storm waits
    at(74, STOP, { sample: true }); runner.tick();    // sample secured at T+74 s
    at(76, STOP); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(77, STOP); runner.tick();                     // 3 s later
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(91, toward(0.1)); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(92, toward(0.15)); runner.tick();             // 15 s after the storm
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    at(107, toward(0.3)); runner.tick();
    // The compressed storm ramp reaches the 2018 Gale peak 30 s after it started.
    expect(useMissionStore.getState().environment.dustOpacity).toBe(8);

    at(130, AIRLOCK); runner.tick();                 // both end within 25 m of the airlock
    expect(activeAlerts()).toEqual([]);
    expect(useMissionStore.getState().environment.dustOpacity).toBe(0.45);
    runner.stop();
  });

  it('never interrupts a presenter mid-sample: the storm waits for the sample, or 90 s at the stop (N2)', () => {
    planSortie();
    const talking = quietRunner();
    at(55, STOP); talking.tick();
    at(140, STOP); talking.tick();
    expect(activeAlerts()).toEqual([]);              // 85 s at the stop, still no sample
    at(144, STOP); talking.tick();
    expect(activeAlerts()).toEqual([]);
    at(145, STOP); talking.tick();                   // 90 s at the stop
    expect(activeAlerts()).toEqual(['dust-storm']);
    talking.stop();
  });

  it('waits for the sortie stop itself, not an accepted find on the way (R5 a)', () => {
    const find = { name: 'M01', x: 508, z: 553 };
    planSortie([HAB_WAYPOINT, find, S1]);            // a find accepted on the way out sits at index 1
    const runner = quietRunner();
    at(40, find, { route: { nextIndex: 2, visited: ['HAB', 'M01'] } }); runner.tick();   // the find reached
    at(60, find, { sample: true }); runner.tick();     // a sample at the find
    at(100, find); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(110, STOP); runner.tick();                    // the stop reached at T+110 s
    // the sample at the find does not count for the stop (N1): the stop beat keeps its time
    at(125, STOP); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(126, STOP, { sample: true }); runner.tick();  // a sample at the stop
    at(129, STOP); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    runner.stop();
  });

  it('keeps the stop reached when a re-plan resets the route progress (R5 b)', () => {
    planSortie();
    const runner = quietRunner();
    at(55, STOP); runner.tick();
    at(60, STOP, { route: { nextIndex: 0, visited: [] } }); runner.tick();   // Re-plan at the table during the EVA
    at(70, STOP, { sample: true }); runner.tick();
    at(73, STOP); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    runner.stop();
  });

  it('meets both events before the end area when the crew samples and runs straight home (N14)', () => {
    planSortie();
    const runner = loggedRunner();
    at(37, STOP); runner.tick();                     // the stop at a jog
    at(45, STOP, { sample: true }); runner.tick();
    // home at 1.5 m/s along the 55 m line, one tick per second
    let radiationFrom = null;
    for (let t = 48; t <= 90; t += 1) {
      const p = toward(Math.min(1, ((t - 48) * 1.5) / 55));
      at(t, p); runner.tick();
      if (radiationFrom === null && activeAlerts().includes('radiation')) radiationFrom = fromAirlock(p);
    }
    expect(startedAt('dust-storm')).toBe(48);
    expect(radiationFrom).toBeGreaterThan(25);       // the radiation alert started outside the end area
    runner.stop();
  });

  it('meets both events before the end area when the crew turns home without sampling (N14)', () => {
    planSortie();
    const runner = loggedRunner();
    at(50, STOP); runner.tick();
    let stormFrom = null, radiationFrom = null;
    for (let t = 51; t <= 100; t += 1) {
      const p = toward(Math.min(1, (t - 51) / 55));  // walking home at 1.0 m/s
      at(t, p); runner.tick();
      if (stormFrom === null && activeAlerts().includes('dust-storm')) stormFrom = fromAirlock(p);
      if (radiationFrom === null && activeAlerts().includes('radiation')) radiationFrom = fromAirlock(p);
    }
    expect(stormFrom).toBeGreaterThan(25);
    expect(radiationFrom).toBeGreaterThan(25);
    runner.stop();
  });

  it('still plays both events for a crew that never leaves the airlock area: from the latest times, at least 20 s each', () => {
    planSortie();
    const runner = quietRunner();
    at(239, AIRLOCK); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(240, AIRLOCK); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(254, AIRLOCK); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(255, AIRLOCK); runner.tick();                 // the radiation alert's latest time, 15 s after the storm
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    at(260, AIRLOCK); runner.tick();                 // the storm has played its 20 s
    expect(activeAlerts()).toEqual(['radiation']);
    at(275, AIRLOCK); runner.tick();
    expect(activeAlerts()).toEqual([]);
    runner.stop();
  });

  it('keeps guiding home after the alerts end, and keeps the stop it left out skipped (P5)', () => {
    planSortie();
    const runner = quietRunner();
    at(50, toward(0.2)); runner.tick();
    expect(runner.fire('dust-storm')).toBe(true);    // the storm before the stop (for example from latestSec)
    // what the planner writes for the storm: the route home, the habitat as the shelter, S1 skipped
    writeRoute(useMissionStore, { ok: true, path: [[toward(0.2).x, toward(0.2).z], [AIRLOCK.x, AIRLOCK.z]], distance: 44, climb: 0, steepestSlopeDeg: 3, target: { id: 'HAB', name: 'Habitat' } }, 'storm', HAB_SHELTER);
    expect(useMissionStore.getState().route.skipped).toEqual([S1.name]);

    at(75, { x: AIRLOCK.x - 11, z: AIRLOCK.z }); runner.tick();   // 11 m out: the storm ends
    expect(activeAlerts()).toEqual([]);
    let route = useMissionStore.getState().route;
    expect(route.shelter).toEqual(HAB_SHELTER);      // the habitat is still the target, not S1
    expect(route.skipped).toEqual([S1.name]);

    useMissionStore.setState((state) => ({ eva: { ...state.eva, atHabitat: true } }));   // inside the habitat
    at(80, AIRLOCK); runner.tick();
    route = useMissionStore.getState().route;
    expect(route.shelter).toBeNull();
    expect(route.skipped).toEqual([S1.name]);        // recorded as skipped
    runner.stop();
  });

  it('runs the full EVA from a full objective, at T+480 s and T+720 s as before', () => {
    setNeeds({ objective: 'bright-angel' });
    const runner = quietRunner();
    expect(runner.mission).toBe('full');
    at(479, { x: 0, z: 0 }); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(480, { x: 0, z: 0 }); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    expect(useMissionStore.getState().environment.dustOpacity).toBe(0.45);
    at(570, { x: 0, z: 0 }); runner.tick();        // the 90 s ramp of dust-storm.json
    expect(useMissionStore.getState().environment.dustOpacity).toBe(8);
    at(720, { x: 0, z: 0 }); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    expect(runner.listEvents().find((event) => event.id === 'radiation').trigger).toEqual({ type: 'missionTime', atSec: 720 });
    runner.stop();
  });

  it('reads the mission once, from the objective locked at Begin EVA: a later change changes nothing', () => {
    setNeeds({ objective: 'sortie' });
    planSortie();
    beginEgress();                                 // Begin EVA locks the needs
    expect(setNeeds({ objective: 'cheyava' })).toBe(false);
    const runner = quietRunner({ objective: useMissionStore.getState().needs.objective });
    // Even a direct write to the needs after the start leaves the running mission alone.
    useMissionStore.setState((state) => ({ needs: { ...state.needs, objective: 'cheyava' } }));
    at(55, STOP, { sample: true }); runner.tick();
    at(58, STOP); runner.tick();
    expect(runner.mission).toBe('first');
    expect(activeAlerts()).toEqual(['dust-storm']);
    runner.stop();
  });

  it('lists the triggers of the chosen objective before the EVA', () => {
    expect(listEvents().find((event) => event.id === 'dust-storm').trigger.atSec).toBe(45);
    setNeeds({ objective: 'cheyava' });
    expect(listEvents().find((event) => event.id === 'dust-storm').trigger.atSec).toBe(480);
  });

  it('places the stop from the route locked at Begin EVA, with the arrival radius of the waypoint runner', () => {
    expect(plannedStops({ waypoints: [HAB_WAYPOINT, S1] })).toEqual({ sortie: { x: STOP.x, z: STOP.z, radius: 5 } });
    const stops = [{ id: 'sortie', waypoint: S1.name, arrival_radius: { value: 8, unit: 'm' } }];
    expect(plannedStops({ waypoints: [HAB_WAYPOINT, S1] }, stops)).toEqual({ sortie: { x: STOP.x, z: STOP.z, radius: 8 } });
    expect(plannedStops({ waypoints: [HAB_WAYPOINT] })).toEqual({});
  });

  it('tags the shortened times SIM in the registry and in the event sources', () => {
    for (const path of Object.keys(MISSION_SOURCES)) expect(provenance.lookup(path)?.tag).toBe('SIM');
    expect(eventEnvironmentSources('first')['environment.dustOpacity'].source).toMatch(/30 s \(SIM\)/);
    expect(eventEnvironmentSources('full')['environment.dustOpacity'].source).not.toMatch(/first mission/);
  });
});

describe('event route', () => {
  it('lists as skipped only the stops not reached yet', () => {
    useMissionStore.setState((state) => ({
      route: {
        ...state.route,
        waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'S1', x: 1, z: 1 }, { name: 'S2', x: 2, z: 2 }],
        visited: ['HAB', 'S1'],
      },
    }));
    writeRoute(useMissionStore, { ok: true, path: [[2, 2], [0, 0]], distance: 3, climb: 0, steepestSlopeDeg: 1, target: { id: 'HAB', name: 'Habitat' } }, 'storm');
    expect(useMissionStore.getState().route.skipped).toEqual(['S2']);
  });
});

describe('resuming after a shelter return (D12)', () => {
  const BA = { name: 'WP3 · Bright Angel outcrop', x: -11, z: -50, stopId: 'bright-angel', required: false };
  const CF = { name: 'Cheyava Falls', x: 0, z: 0, stopId: 'cheyava-falls', required: true };
  const stops = allStops(stopsJson);
  const quietWaypoints = () => startWaypointRunner({ store: useMissionStore, stops, setInterval: () => 0, clearInterval: () => {} });
  const stormRouteHome = (from) => writeRoute(useMissionStore, {
    ok: true, path: [[from.x, from.z], [AIRLOCK.x, AIRLOCK.z]], distance: 60, climb: 0, steepestSlopeDeg: 3, target: { id: 'HAB', name: 'Habitat' },
  }, 'storm', HAB_SHELTER);
  /** What the table's Re-plan does once no alert route is active (src/plan/useRoutePlanner.js): the skipped stops back, progress kept. */
  const replanAtTable = () => useMissionStore.setState((state) => ({ route: { ...state.route, skipped: [], path: [[AIRLOCK.x, AIRLOCK.z], [BA.x, BA.z], [CF.x, CF.z]] } }));
  const atHabitat = (value) => useMissionStore.setState((state) => ({ eva: { ...state.eva, atHabitat: value } }));

  it('full EVA: storm, shelter return, Re-plan at the table, walk out: Bright Angel is the next target and its arrival counts', () => {
    setNeeds({ objective: 'cheyava' });
    useMissionStore.setState((state) => ({ mode: 'walk', route: { ...state.route, waypoints: [HAB_WAYPOINT, BA, CF], nextIndex: 1, visited: ['HAB'] } }));
    const runner = quietRunner();
    const waypoints = quietWaypoints();
    const out = { x: 300, z: 300 };
    at(480, out); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    stormRouteHome(out);
    expect(useMissionStore.getState().route.skipped).toEqual([BA.name, CF.name]);
    waypoints.tick();
    expect(nextTarget(useMissionStore.getState().route).kind).toBe('shelter');

    at(560, AIRLOCK); runner.tick();                 // home: the storm ends, the habitat stays the target
    expect(activeAlerts()).toEqual([]);
    expect(nextTarget(useMissionStore.getState().route).kind).toBe('shelter');
    atHabitat(true);
    at(565, AIRLOCK); runner.tick();
    expect(nextTarget(useMissionStore.getState().route).kind).toBe('complete');   // nothing resumes by itself

    replanAtTable();
    atHabitat(false);
    at(570, AIRLOCK); waypoints.tick(); runner.tick();
    const target = nextTarget(useMissionStore.getState().route);
    expect(target).toMatchObject({ kind: 'waypoint', name: BA.name });
    expect(useMissionStore.getState().navigation.waypointRangeM).toBeCloseTo(Math.hypot(BA.x - AIRLOCK.x, BA.z - AIRLOCK.z), 0);

    at(650, { x: BA.x + 1, z: BA.z }); waypoints.tick(); runner.tick();   // at Bright Angel
    const route = useMissionStore.getState().route;
    expect(route.visited).toContain(BA.name);
    expect(nextTarget(route)).toMatchObject({ kind: 'waypoint', name: CF.name });
    expect(createArrivalTracker().update(stops, route.visited)?.id).toBe('bright-angel');   // its card opens, as on main
    expect(activeAlerts()).toEqual([]);              // the storm ran once: it does not send the crew home again
    waypoints.stop();
    runner.stop();
  });

  it('first mission: with its stop visited it still reads complete after a shelter return, and Re-plan restores nothing', () => {
    planSortie();
    useMissionStore.setState({ mode: 'walk' });
    const runner = quietRunner();
    const waypoints = quietWaypoints();
    at(55, STOP); waypoints.tick(); runner.tick();
    expect(useMissionStore.getState().route.visited).toContain(S1.name);
    at(60, STOP, { sample: true }); runner.tick();
    at(63, STOP); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    stormRouteHome(STOP);
    expect(useMissionStore.getState().route.skipped).toEqual([]);   // the stop was reached: nothing skipped
    at(120, AIRLOCK); runner.tick();                 // home: the storm ends, the radiation alert starts and plays 20 s
    at(145, AIRLOCK); runner.tick();
    expect(activeAlerts()).toEqual([]);
    atHabitat(true);
    at(150, AIRLOCK); runner.tick();
    expect(nextTarget(useMissionStore.getState().route).kind).toBe('complete');
    useMissionStore.setState((state) => ({ route: { ...state.route, skipped: [] } }));   // Re-plan at the table
    waypoints.tick();
    expect(nextTarget(useMissionStore.getState().route).kind).toBe('complete');
    waypoints.stop();
    runner.stop();
  });
});
