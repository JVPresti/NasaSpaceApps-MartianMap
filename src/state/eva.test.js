import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventEngine } from '../sim/eventEngine.js';
import exampleEvent from '../sim/events/example-event.json';
import { continueEva, recordEvaEvent, requestEvaEnd, samePath, startEvaRunner } from './eva.js';
import { resetStore, storeAdapter, useMissionStore } from './store.js';

const HAB = { id: 'HAB', x: 535.1, z: 574.1 };
const OUTSIDE = { x: 500, z: 600 };
const INSIDE = { x: HAB.x, z: HAB.z };

const runners = [];
const runnerAt = (options = {}) => {
  const runner = startEvaRunner({
    store: useMissionStore,
    habitat: HAB,
    setInterval: () => 0,
    clearInterval: () => {},
    ...options,
  });
  runners.push(runner);
  return runner;
};

const place = (x, z) => useMissionStore.setState((state) => ({ navigation: { ...state.navigation, x, z } }));
const mode = (next) => useMissionStore.setState({ mode: next });
const mission = (elapsedSec, paused = false) => useMissionStore.setState((state) => ({ mission: { ...state.mission, elapsedSec, paused } }));
const suit = (patch) => useMissionStore.setState((state) => ({ suit: { ...state.suit, ...patch } }));
const eva = () => useMissionStore.getState().eva;

beforeEach(() => {
  resetStore();
  mode('walk');   // the store opens in Plan (#166); the EVA runs in Walk
});

afterEach(() => {
  while (runners.length > 0) runners.pop().stop();
});

describe('EVA statistics runner', () => {
  it('starts outside the HAB, adds distance only while walking unpaused, tracks honest minima and freezes on re-entry', () => {
    const runner = runnerAt();
    expect(eva().phase).toBe('ready');

    place(OUTSIDE.x, OUTSIDE.z);
    mission(10);
    runner.tick();
    expect(eva().phase).toBe('active');
    expect(eva().startedAtSec).toBe(10);
    expect(eva().distanceM).toBe(0);
    // A missing suit reading must stay null; no invented initial minimum.
    expect(eva().minOxygenMarginSec).toBeNull();
    expect(eva().minBatteryPct).toBeNull();

    place(490, 600);
    runner.tick();
    expect(eva().distanceM).toBeCloseTo(10, 9);

    suit({ marginSec: 1200, batteryPct: 76 });
    runner.tick();
    expect(eva().minOxygenMarginSec).toBe(1200);
    expect(eva().minBatteryPct).toBe(76);

    suit({ marginSec: 900, batteryPct: 80 });
    runner.tick();
    expect(eva().minOxygenMarginSec).toBe(900);
    expect(eva().minBatteryPct).toBe(76);

    // Paused: position changes do not add distance or a new minimum.
    mission(11, true);
    suit({ marginSec: 1500, batteryPct: 90 });
    place(480, 600);
    runner.tick();
    expect(eva().distanceM).toBeCloseTo(10, 9);
    expect(eva().minOxygenMarginSec).toBe(900);
    expect(eva().minBatteryPct).toBe(76);

    // Plan mode: same, and the baseline is dropped.
    mission(12, false);
    mode('plan');
    place(470, 600);
    runner.tick();
    expect(eva().distanceM).toBeCloseTo(10, 9);

    // Back to Walk: the first tick sets a new baseline, so the mode switch adds no jump.
    mode('walk');
    place(460, 600);
    runner.tick();
    expect(eva().distanceM).toBeCloseTo(10, 9);

    useMissionStore.setState((state) => ({
      sampling: { ...state.sampling, count: 2, photos: 4, samples: [{ id: 1, kind: 'rock', x: 0, z: 0, photo: true, texture: true, sealed: true, atSec: 90 }] },
      environment: { ...state.environment, doseUgy: 4.7, doseRateUgyH: 10 },
    }));
    recordEvaEvent(useMissionStore, { type: 'start', eventId: 'radiation', label: 'Radiation alert', missionTimeSec: 20 });

    place(INSIDE.x, INSIDE.z);
    mission(100);
    runner.tick();
    // Back at the habitat the EVA goes on until the astronaut ends it (#244).
    expect(eva().phase).toBe('active');
    expect(eva().atHabitat).toBe(true);
    expect(requestEvaEnd(useMissionStore)).toBe(true);
    runner.tick();

    const ended = eva();
    expect(ended.phase).toBe('ended');
    expect(ended.endedAtSec).toBe(100);
    expect(useMissionStore.getState().mission.paused).toBe(true);
    // The step from 460 m to the HAB is real walking and counts.
    const expectedDistance = 10 + Math.hypot(INSIDE.x - 460, INSIDE.z - 600);
    expect(ended.distanceM).toBeCloseTo(expectedDistance, 9);
    expect(ended.summary).toMatchObject({
      startedAtSec: 10,
      endedAtSec: 100,
      elapsedOutsideSec: 90,
      distanceM: expectedDistance,
      minOxygenMarginSec: 900,
      minBatteryPct: 76,
      sampleCount: 2,
      photos: 4,
      doseUgy: 4.7,
      doseRateUgyH: 10,
    });
    expect(ended.summary.samples).toHaveLength(1);
    expect(ended.summary.events).toEqual([{ type: 'start', eventId: 'radiation', label: 'Radiation alert', atSec: 20 }]);

    // The final snapshot is deeply frozen, so the debrief cannot mutate the store by accident.
    for (const value of [ended.summary, ended.summary.samples, ended.summary.events, ended.summary.routeChanges]) {
      expect(Object.isFrozen(value)).toBe(true);
    }

    // After the end, event history is final.
    expect(recordEvaEvent(useMissionStore, { type: 'end', eventId: 'radiation', missionTimeSec: 101 })).toBe(false);
    expect(eva().events).toHaveLength(1);
  });

  it('starts at the spawn without ending, and ends only at the habitat when asked, not in Plan or paused', () => {
    const runner = runnerAt();

    // The first Walk tick starts the EVA even at the airlock (#244), and being there does not end it.
    place(INSIDE.x, INSIDE.z);
    mission(0);
    runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: true, summary: null });
    runner.tick();
    expect(eva().phase).toBe('active');

    place(600, 600);
    runner.tick();
    expect(eva().phase).toBe('active');

    // Plan mode must not finish the EVA, even inside the arrival area.
    mode('plan');
    place(INSIDE.x, INSIDE.z);
    runner.tick();
    expect(eva().phase).toBe('active');
    expect(eva().summary).toBeNull();

    // Neither does a paused mission.
    mode('walk');
    mission(30, true);
    runner.tick();
    expect(eva().phase).toBe('active');

    mission(31, false);
    runner.tick();
    expect(eva().phase).toBe('active');
    requestEvaEnd(useMissionStore);
    runner.tick();
    expect(eva().phase).toBe('ended');
    expect(eva().summary.endedAtSec).toBe(31);
  });

  it('counts the whole habitat as home: three steps out and back into the cabin offer the end, never force it (#244)', () => {
    const CABIN = { x: 541, z: 582 };   // about 10 m from the foot of the steps, outside the 5 m circle
    const zoneAt = (x, z) => (Math.hypot(x - CABIN.x, z - CABIN.z) < 3 ? 'main' : null);
    const runner = runnerAt({ habitatZoneAt: zoneAt });
    mission(0);
    place(INSIDE.x, INSIDE.z); runner.tick();
    place(INSIDE.x + 2, INSIDE.z); runner.tick();     // a few steps from the airlock, still at the habitat
    place(CABIN.x, CABIN.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: true });   // the cabin counts as the habitat
    expect(requestEvaEnd(useMissionStore)).toBe(true);
    useMissionStore.setState((s) => ({ eva: { ...s.eva, endRequested: false } }));

    place(OUTSIDE.x, OUTSIDE.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: false });
    place(CABIN.x, CABIN.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: true });
    place(OUTSIDE.x, OUTSIDE.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: false });   // walking out again does not end it either
    expect(requestEvaEnd(useMissionStore)).toBe(false);                     // only at the habitat
  });

  it('continues the EVA from the debrief with the statistics still counting (#244)', () => {
    const runner = runnerAt();
    mission(0);
    place(OUTSIDE.x, OUTSIDE.z); runner.tick();
    place(490, 600); runner.tick();
    place(INSIDE.x, INSIDE.z); runner.tick();
    requestEvaEnd(useMissionStore); runner.tick();
    expect(eva().phase).toBe('ended');
    const walked = eva().distanceM;

    expect(continueEva(useMissionStore)).toBe(true);
    expect(eva()).toMatchObject({ phase: 'active', summary: null, endedAtSec: null });
    mission(50, false);
    runner.tick();                                     // new baseline after the pause
    place(INSIDE.x + 20, INSIDE.z); runner.tick();
    expect(eva().distanceM).toBeCloseTo(walked + 20, 9);
    place(INSIDE.x, INSIDE.z); runner.tick();
    requestEvaEnd(useMissionStore); runner.tick();
    expect(eva().phase).toBe('ended');                 // and it can end again
    expect(continueEva(useMissionStore)).toBe(true);
    expect(continueEva(useMissionStore)).toBe(false);  // only from the debrief
  });

  it('records only real route content changes with before/after snapshots and a kind', () => {
    useMissionStore.setState((state) => ({
      route: {
        ...state.route,
        path: [[0, 0], [10, 0]],
        distanceM: 10,
        reason: 'Planned route',
        waypoints: [{ name: 'HAB', x: 0, z: 0 }],
      },
    }));
    runnerAt();
    expect(eva().routeChanges).toHaveLength(1);
    expect(eva().routeChanges[0]).toMatchObject({
      kind: 'initial',
      reason: 'Planned route',
      before: null,
      after: { path: [[0, 0], [10, 0]], distanceM: 10, reason: 'Planned route' },
    });

    // The per-leg cost runner and waypoint tracking move through this slice constantly. Same path content means no
    // debrief entry, even with a new array, new nextIndex/visited/legs/totals and a new distance.
    useMissionStore.setState((state) => ({
      route: {
        ...state.route,
        path: state.route.path.map((point) => [...point]),
        distanceM: 999,
        nextIndex: 3,
        visited: ['HAB'],
        legs: [{ from: 'HAB', to: 'WP1', distanceM: 10 }],
        totals: { distanceM: 999, returnTimeSec: 12 },
        etaSec: 500,
      },
    }));
    expect(eva().routeChanges).toHaveLength(1);

    useMissionStore.setState((state) => ({
      route: { ...state.route, path: [[0, 0], [0, 10]], reason: 'Off route: new route from your position' },
    }));
    useMissionStore.setState((state) => ({
      route: { ...state.route, path: [[0, 0], [-10, 0]], reason: 'Detour: steeper than 25° ahead' },
    }));
    useMissionStore.setState((state) => ({
      route: { ...state.route, path: [[0, 0], [5, 5]], reason: 'Radiation alert: solar particle event. Enter the habitat now. (radiation)', shelter: { id: 'HAB', name: 'HAB', x: HAB.x, z: HAB.z } },
      alerts: { radiation: { id: 'radiation', eventId: 'radiation', level: 'danger', text: 'Radiation alert: solar particle event. Enter the habitat now.', startedAtSec: 720, active: true } },
    }));
    useMissionStore.setState((state) => ({
      route: { ...state.route, path: [[0, 0], [3, 3]], reason: 'Planned route', shelter: null },
      alerts: {},
    }));
    // Losing the route is a real change. A later plan is then a re-plan, not a second initial route.
    useMissionStore.setState((state) => ({ route: { ...state.route, path: null, reason: 'No route found' } }));
    useMissionStore.setState((state) => ({ route: { ...state.route, path: [[1, 1], [4, 4]], reason: 'Planned route' } }));

    expect(eva().routeChanges.map((change) => change.kind)).toEqual(['initial', 'offroute', 'slope', 'event', 'replan', 'replan', 'replan']);
    const changes = eva().routeChanges;
    expect(changes[1].before.path).toEqual([[0, 0], [10, 0]]);
    expect(changes[1].after.path).toEqual([[0, 0], [0, 10]]);
    expect(changes[1].before.reason).toBe('Planned route');
    expect(changes[1].after.reason).toMatch(/^Off route/);
    expect(changes[2].after.reason).toMatch(/^Detour/);
    expect(changes[3].after.shelterId).toBe('HAB');
    expect(changes[4].after.path).toEqual([[0, 0], [3, 3]]);
    expect(changes[5]).toMatchObject({ kind: 'replan', reason: 'No route found', before: { path: [[0, 0], [3, 3]] }, after: null });
    expect(changes[6]).toMatchObject({ kind: 'replan', reason: 'Planned route', before: null, after: { path: [[1, 1], [4, 4]] } });
  });

  it('keeps the event engine start and end in the history with their mission time', () => {
    let t = 0;
    const engine = createEventEngine({
      store: storeAdapter,
      events: [exampleEvent],
      getMissionTime: () => t,
      log: (entry) => recordEvaEvent(useMissionStore, { ...entry, label: 'Demo alarm' }),
    });

    engine.fire('demo-alarm');
    t = 11;
    engine.update(t);

    expect(eva().events).toEqual([
      { type: 'start', eventId: 'demo-alarm', label: 'Demo alarm', atSec: 0 },
      { type: 'end', eventId: 'demo-alarm', label: 'Demo alarm', atSec: 11 },
    ]);
  });

  it('drops the distance baseline even if pause or Plan begins and ends between two samples', () => {
    place(OUTSIDE.x, OUTSIDE.z);
    const runner = runnerAt();
    place(OUTSIDE.x + 2, OUTSIDE.z);
    runner.tick();
    expect(eva().distanceM).toBe(2);
    mission(10, true);
    place(OUTSIDE.x + 100, OUTSIDE.z);
    mission(10, false);
    runner.tick();
    expect(eva().distanceM).toBe(2);
    mode('plan');
    place(OUTSIDE.x + 200, OUTSIDE.z);
    mode('walk');
    runner.tick();
    expect(eva().distanceM).toBe(2);
  });

  it('compares path content instead of references', () => {
    expect(samePath([[0, 0], [1, 2]], [[0, 0], [1, 2]])).toBe(true);
    expect(samePath([[0, 0], [1, 2]], [[0, 0], [1, 3]])).toBe(false);
    expect(samePath(null, null)).toBe(true);
    expect(samePath([], [])).toBe(true);
    expect(samePath([[0, 0]], null)).toBe(false);
  });
});
