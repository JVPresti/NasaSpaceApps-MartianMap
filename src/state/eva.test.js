import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventEngine } from '../sim/eventEngine.js';
import exampleEvent from '../sim/events/example-event.json';
import { catalogs } from '../i18n/index.js';
import { reviewRoute } from '../sim/routeReview.js';
import { applyPlannedRoute } from '../sim/routeUpdate.js';
import { continueEva, recordEvaEvent, requestEvaEnd, samePath, startEvaRunner, TRACK_STEP_M } from './eva.js';
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

  it('without the HAB entry (shelters.json not loaded) counts only the walk zones, so the cabin can still end the EVA', () => {
    const CABIN = { x: 541, z: 582 };
    const zoneAt = (x, z) => (Math.hypot(x - CABIN.x, z - CABIN.z) < 3 ? 'main' : null);
    expect(() => runnerAt({ habitat: undefined })).toThrow(TypeError);
    const runner = runnerAt({ habitat: null, habitatZoneAt: zoneAt });
    mission(0);
    place(INSIDE.x, INSIDE.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: false });   // no circle at the foot of the steps
    place(CABIN.x, CABIN.z); runner.tick();
    expect(eva()).toMatchObject({ phase: 'active', atHabitat: true });
    expect(requestEvaEnd(useMissionStore)).toBe(true);
    runner.tick();
    expect(eva().phase).toBe('ended');
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
      route: { ...state.route, path: [[0, 0], [-10, 0]], reason: 'Detour: steeper than 20° ahead' },
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

describe('route review inputs (#274)', () => {
  // A plan west from the habitat along z = 574.1, two legs of 100 m at 1 m/s and 0.1 g/m.
  const PLAN_PATH = [[HAB.x, HAB.z], [HAB.x - 100, HAB.z], [HAB.x - 200, HAB.z]];
  const ROUTE = {
    path: PLAN_PATH,
    distanceM: 200,
    reason: 'Planned route',
    decision: 'go',
    profile: 'fastest',
    waypoints: [{ name: 'HAB', x: HAB.x, z: HAB.z }, { name: 'WP1 · channel floor', x: HAB.x - 100, z: HAB.z }, { name: 'Cheyava Falls', x: HAB.x - 200, z: HAB.z }],
    // WP1 carries 5 min of work (#247): its leg's timeSec and o2G are walking plus work, walkSec and workO2G apart.
    legs: [
      { from: 'HAB', to: 'WP1 · channel floor', distanceM: 100, timeSec: 400, o2G: 25, walkSec: 100, workSec: 300, workO2G: 15, climbM: 1, maxSlopeDeg: 4, o2Pct: 2 },
      { from: 'WP1 · channel floor', to: 'Cheyava Falls', distanceM: 100, timeSec: 100, o2G: 10, walkSec: 100, workSec: 0, workO2G: 0, climbM: 1, maxSlopeDeg: 4, o2Pct: 2 },
    ],
    totals: { distanceM: 200, timeSec: 500, o2G: 35, walkSec: 200, workSec: 300, workO2G: 15, marginSec: 9000, status: 'nominal' },
  };
  const setRoute = (patch = {}) => useMissionStore.setState((state) => ({ route: { ...state.route, ...ROUTE, ...patch } }));
  const slope = (slopeDeg) => useMissionStore.setState((state) => ({ navigation: { ...state.navigation, slopeDeg } }));

  /** Walk in straight steps of at most 0.5 m to (x, z), one tick each, the clock at 1 m/s and the O2 at 0.12 g/m. */
  function walkTo(runner, x, z) {
    const nav = useMissionStore.getState().navigation;
    const from = { x: nav.x, z: nav.z };
    const length = Math.hypot(x - from.x, z - from.z);
    const n = Math.max(1, Math.ceil(length / 0.5));
    for (let i = 1; i <= n; i += 1) {
      const s = useMissionStore.getState();
      const step = length / n;
      mission(s.mission.elapsedSec + step);
      suit({ oxygenG: (s.suit.oxygenG ?? 600) - 0.12 * step, marginSec: (s.suit.marginSec ?? 3000) - step });
      place(from.x + (x - from.x) * i / n, from.z + (z - from.z) * i / n);
      runner.tick();
    }
  }

  it('records a point every 2 m of walking with the margin, O2, slope, running event and habitat flag', () => {
    setRoute();
    place(HAB.x, HAB.z);
    mission(0);
    suit({ marginSec: 3000, oxygenG: 600 });
    slope(3.24);
    const runner = runnerAt();
    expect(eva().track).toHaveLength(1);
    expect(eva().track[0]).toEqual({ x: HAB.x, z: HAB.z, atSec: 0, marginSec: 3000, slopeDeg: 3.2, eventId: null, o2G: 600, home: true });

    walkTo(runner, HAB.x - 20, HAB.z);
    const track = eva().track;
    expect(track).toHaveLength(1 + 20 / TRACK_STEP_M);
    for (let i = 1; i < track.length; i += 1) {
      expect(Math.hypot(track[i].x - track[i - 1].x, track[i].z - track[i - 1].z)).toBeCloseTo(TRACK_STEP_M, 6);
    }
    expect(track.at(-1)).toMatchObject({ x: HAB.x - 20, z: HAB.z, atSec: 20, marginSec: 2980, o2G: 597.6, home: false });

    // The event the event engine is running, from the EVA's own history.
    recordEvaEvent(useMissionStore, { type: 'start', eventId: 'dust-storm', label: 'Dust storm', missionTimeSec: 20 });
    slope(21);
    walkTo(runner, HAB.x - 24, HAB.z);
    expect(eva().track.at(-1)).toMatchObject({ eventId: 'dust-storm', slopeDeg: 21 });
    recordEvaEvent(useMissionStore, { type: 'end', eventId: 'dust-storm', label: 'Dust storm', missionTimeSec: 24 });
    walkTo(runner, HAB.x - 26, HAB.z);
    expect(eva().track.at(-1).eventId).toBeNull();

    // Standing still, paused or in Plan adds no point.
    const count = eva().track.length;
    runner.tick();
    mission(30, true);
    place(HAB.x - 60, HAB.z);
    runner.tick();
    mission(30, false);
    mode('plan');
    runner.tick();
    expect(eva().track).toHaveLength(count);
  });

  it('takes the slope from the injected terrain query when there is one', () => {
    place(HAB.x, HAB.z);
    const runner = runnerAt({ slopeAt: (x) => (x < HAB.x - 5 ? 22.04 : 2) });
    walkTo(runner, HAB.x - 10, HAB.z);
    expect(eva().track[0].slopeDeg).toBe(2);
    expect(eva().track.at(-1).slopeDeg).toBe(22);
  });

  it('keeps the plan approved at Begin EVA when re-plans change the route', () => {
    // A planned stop carries its own name as label (src/sim/missionNeeds.js); the debrief names samples by it.
    setRoute({ waypoints: ROUTE.waypoints.map((w, i) => (i === 1 ? { ...w, label: 'Channel floor', stopId: 'wp1' } : w)) });
    place(HAB.x, HAB.z);
    mission(5);
    runnerAt();
    const plan = eva().plan;
    expect(plan).toMatchObject({ atSec: 5, decision: 'go', profile: 'fastest', path: PLAN_PATH });
    expect(plan.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP1 · channel floor', 'Cheyava Falls']);
    expect(plan.waypoints.map((w) => w.label)).toEqual([null, 'Channel floor', null]);
    expect(plan.legs).toEqual([
      { from: 'HAB', to: 'WP1 · channel floor', distanceM: 100, timeSec: 400, o2G: 25, walkSec: 100, workSec: 300, workO2G: 15, climbM: 1, maxSlopeDeg: 4 },
      { from: 'WP1 · channel floor', to: 'Cheyava Falls', distanceM: 100, timeSec: 100, o2G: 10, walkSec: 100, workSec: 0, workO2G: 0, climbM: 1, maxSlopeDeg: 4 },
    ]);
    expect(plan.totals).toEqual({ distanceM: 200, timeSec: 500, o2G: 35, walkSec: 200, workSec: 300, workO2G: 15, marginSec: 9000 });
    // A detached copy: the store route can change without touching it.
    expect(plan.path).not.toBe(useMissionStore.getState().route.path);

    useMissionStore.setState((state) => ({ route: { ...state.route, path: [[0, 0], [5, 5]], reason: 'Off route: new route from your position', decision: 'pending', legs: [] } }));
    expect(eva().plan.path).toEqual(PLAN_PATH);
  });

  it('takes the first route when it arrives after the runner, and its per-leg costs when they follow', () => {
    place(HAB.x, HAB.z);
    runnerAt();
    expect(eva().plan).toBeNull();
    setRoute({ legs: [], totals: null });
    expect(eva().plan.legs).toEqual([]);
    useMissionStore.setState((state) => ({ route: { ...state.route, legs: ROUTE.legs, totals: ROUTE.totals } }));
    expect(eva().plan.legs).toHaveLength(2);
    expect(eva().plan.totals).toMatchObject({ timeSec: 500, walkSec: 200 });
  });

  it('classifies the slope detour by the kind its writer stored, with the reason in English or Spanish (B2)', () => {
    for (const lang of ['en', 'es']) {
      resetStore();
      mode('walk');
      setRoute();
      place(HAB.x, HAB.z);
      const runner = runnerAt();
      const reason = catalogs[lang]['ui.detour.steeper.than.p0.ahead'].replace('{p0}', '20');
      applyPlannedRoute(useMissionStore, { ok: true, path: [[HAB.x, HAB.z], [HAB.x - 50, HAB.z + 30]], distance: 58, climb: 0, steepestSlopeDeg: 9 }, { reason, kind: 'slope' });
      expect(eva().routeChanges.map((c) => c.kind), lang).toEqual(['initial', 'slope']);
      expect(eva().routeChanges[1].reason).toBe(reason);
      // A later route from a writer that sets no kind (an event's route to a shelter) does not inherit 'slope'.
      useMissionStore.setState((state) => ({ route: { ...state.route, path: [[HAB.x - 50, HAB.z + 30], [HAB.x, HAB.z]], reason: 'Dust storm: opacity rising. Return to the habitat. (dust-storm)', shelter: { id: 'HAB', x: HAB.x, z: HAB.z } } }));
      expect(eva().routeChanges.map((c) => c.kind), lang).toEqual(['initial', 'slope', 'event']);
      runner.stop();
      runners.splice(runners.indexOf(runner), 1);
    }
  });

  it('judges a walk along the system slope detour forced in English and in Spanish (B2)', () => {
    const verdicts = {};
    for (const lang of ['en', 'es']) {
      resetStore();
      mode('walk');
      setRoute();
      place(HAB.x, HAB.z);
      mission(0);
      suit({ marginSec: 3000, oxygenG: 600 });
      slope(5);
      const runner = runnerAt();
      walkTo(runner, HAB.x - 40, HAB.z);
      // The system's slope detour from where the crew stands, then the walk follows it 30 m off the plan and back.
      const detour = [[HAB.x - 40, HAB.z], [HAB.x - 60, HAB.z + 30], [HAB.x - 120, HAB.z + 30], [HAB.x - 160, HAB.z], [HAB.x - 200, HAB.z]];
      const reason = catalogs[lang]['ui.detour.steeper.than.p0.ahead'].replace('{p0}', '20');
      applyPlannedRoute(useMissionStore, { ok: true, path: detour, distance: 230, climb: 0, steepestSlopeDeg: 12 }, { reason, kind: 'slope' });
      for (const [x, z] of detour.slice(1)) walkTo(runner, x, z);
      const e = eva();
      const review = reviewRoute({ track: e.track, plan: e.plan, routeChanges: e.routeChanges, finds: [], samples: [] });
      verdicts[lang] = review.deviations.map((d) => [d.verdict, d.reason.code, d.reason.kind]);
      runner.stop();
      runners.splice(runners.indexOf(runner), 1);
    }
    expect(verdicts.en).toEqual([['forced', 'replan', 'slope']]);
    expect(verdicts.es).toEqual(verdicts.en);
  });

  it('records where each route change happened', () => {
    setRoute();
    place(HAB.x, HAB.z);
    runnerAt();
    expect(eva().routeChanges[0]).toMatchObject({ kind: 'initial', x: HAB.x, z: HAB.z });
    place(500, 590);
    useMissionStore.setState((state) => ({ route: { ...state.route, path: [[500, 590], [400, 590]], reason: 'Off route: new route from your position' } }));
    expect(eva().routeChanges[1]).toMatchObject({ kind: 'offroute', x: 500, z: 590 });
  });

  it('keeps every marked find with the time it was marked and its card verdict when added, after it leaves the list', () => {
    place(HAB.x, HAB.z);
    mission(40);
    runnerAt();
    const find = { id: 'find-1', label: 'M01', x: 480, z: 620, status: 'pricing', detour: null, error: null, basis: null };
    const other = { id: 'find-2', label: 'M02', x: 400, z: 600, status: 'pricing', detour: null, error: null, basis: null };
    useMissionStore.setState((state) => ({ finds: { ...state.finds, list: [find, other] } }));
    mission(55);
    const priced = { ...find, status: 'priced', detour: { ok: true, verdict: 'go', extraSec: 60 } };
    useMissionStore.setState((state) => ({ finds: { ...state.finds, list: [priced, { ...other, status: 'priced', detour: { ok: true, verdict: 'no-go' } }] } }));
    expect(eva().finds.map((f) => f.verdict)).toEqual([null, null]);   // priced, not added: no verdict recorded
    useMissionStore.setState((state) => ({ finds: { ...state.finds, list: [{ ...priced, status: 'accepted' }, state.finds.list[1]] } }));
    useMissionStore.setState((state) => ({ finds: { ...state.finds, list: [] } }));   // reached: pruneFinds drops it
    expect(eva().finds).toEqual([
      { id: 'find-1', label: 'M01', x: 480, z: 620, atSec: 40, accepted: true, verdict: 'go' },
      { id: 'find-2', label: 'M02', x: 400, z: 600, atSec: 40, accepted: false, verdict: null },
    ]);
  });

  it('puts the point of the lowest margin into the summary track, so the chart and the headline agree', () => {
    place(HAB.x, HAB.z);
    mission(0);
    suit({ marginSec: 3000, oxygenG: 600 });
    const runner = runnerAt();
    walkTo(runner, HAB.x - 10, HAB.z);
    // Standing still at a stop: the margin dips between two track points, then recovers once the walk home shortens.
    mission(useMissionStore.getState().mission.elapsedSec + 30);
    suit({ marginSec: 2900.4 });
    runner.tick();
    mission(useMissionStore.getState().mission.elapsedSec + 1);
    suit({ marginSec: 2985 });
    runner.tick();
    expect(eva().track.some((p) => p.marginSec === 2900)).toBe(false);   // no walking, no regular track point
    walkTo(runner, HAB.x, HAB.z);
    requestEvaEnd(useMissionStore);
    runner.tick();

    const { summary } = eva();
    expect(summary.minOxygenMarginSec).toBe(2900.4);
    const low = summary.track.filter((p) => p.marginSec === Math.round(summary.minOxygenMarginSec));
    expect(low).toEqual([expect.objectContaining({ x: HAB.x - 10, z: HAB.z, atSec: 40 })]);
    expect(Math.min(...summary.track.map((p) => p.marginSec))).toBe(2900);
    // In time order, once.
    const times = summary.track.map((p) => p.atSec);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('freezes the track, plan and finds into the summary, and keeps them counting after continue EVA', () => {
    setRoute();
    place(HAB.x, HAB.z);
    mission(0);
    suit({ marginSec: 3000, oxygenG: 600 });
    slope(5);
    const runner = runnerAt();
    useMissionStore.setState((state) => ({ finds: { ...state.finds, list: [{ id: 'find-1', label: 'M01', x: HAB.x - 50, z: HAB.z + 40, status: 'accepted' }] } }));

    // Out along the plan, a detour to the find, back to the plan and home.
    walkTo(runner, HAB.x - 30, HAB.z);
    walkTo(runner, HAB.x - 50, HAB.z + 40);
    walkTo(runner, HAB.x - 70, HAB.z);
    walkTo(runner, HAB.x, HAB.z);
    requestEvaEnd(useMissionStore);
    runner.tick();

    const first = eva().summary;
    expect(first.plan.path).toEqual(PLAN_PATH);
    expect(first.finds).toHaveLength(1);
    expect(first.track.at(-1)).toMatchObject({ x: HAB.x, z: HAB.z, home: true });
    for (const value of [first.track, first.track[0], first.plan, first.plan.path, first.finds]) expect(Object.isFrozen(value)).toBe(true);
    const before = reviewRoute(first);
    expect(before.deviations.map((d) => d.verdict)).toEqual(['worth']);
    const points = first.track.length;

    // Continue EVA (#244): the same track keeps growing, and a second detour joins the first.
    expect(continueEva(useMissionStore)).toBe(true);
    mission(first.endedAtSec, false);
    runner.tick();
    slope(24);
    walkTo(runner, HAB.x - 120, HAB.z);
    walkTo(runner, HAB.x - 150, HAB.z - 40);
    walkTo(runner, HAB.x - 180, HAB.z);
    slope(5);
    walkTo(runner, HAB.x, HAB.z);
    requestEvaEnd(useMissionStore);
    runner.tick();

    const second = eva().summary;
    expect(second.track.length).toBeGreaterThan(points);
    expect(second.track.slice(0, points)).toEqual(first.track);
    const after = reviewRoute(second);
    expect(after.deviations.map((d) => d.verdict)).toEqual(['worth', 'risky']);
    expect(after.deviations[0].cost).toEqual(before.deviations[0].cost);
  });
});

describe('sampling tasks in the debrief (#352)', () => {
  // route.tasks as the planner writes it for "Collect samples": a rock at Bright Angel, two soil scoops at a clicked
  // point, and a photo at Cheyava Falls left out of the plan for time.
  const BRIGHT_ANGEL = { key: 'bright-angel', type: 'stop', stopId: 'bright-angel', x: HAB.x - 100, z: HAB.z, radiusM: 2, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null };
  const P1 = { key: 'P1', type: 'point', stopId: null, x: HAB.x - 200, z: HAB.z, radiusM: 8, label: 'P1', waypoint: 'P1 · task point', reason: null };
  const CHEYAVA = { key: 'cheyava-falls', type: 'stop', stopId: 'cheyava-falls', x: 0, z: 0, radiusM: 2, label: 'Cheyava Falls', waypoint: 'Cheyava Falls', reason: null };
  const TASKS = [
    { id: 't1', what: 'rock', count: 1, place: BRIGHT_ANGEL, workSec: 480, kept: true, drop: null },
    { id: 't2', what: 'soil', count: 2, place: P1, workSec: 480, kept: true, drop: null },
    { id: 't3', what: 'photo', count: 1, place: CHEYAVA, workSec: 120, kept: false, drop: { limit: 'time', overSec: 300, marginShortSec: 0, batteryShortWh: 0, extraWalkSec: 900, extraM: 900 } },
  ];
  const ROUTE = {
    path: [[HAB.x, HAB.z], [HAB.x - 200, HAB.z]],
    distanceM: 200,
    reason: 'Planned route',
    decision: 'go',
    waypoints: [{ name: 'HAB', x: HAB.x, z: HAB.z }, { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: HAB.x - 100, z: HAB.z }, { name: 'P1 · task point', label: 'P1', x: HAB.x - 200, z: HAB.z }],
    legs: [],
    totals: null,
    tasks: TASKS,
  };

  it('keeps the approved plan\'s tasks and freezes one row per task: done, done elsewhere and left out', () => {
    useMissionStore.setState((state) => ({ route: { ...state.route, ...ROUTE } }));
    place(HAB.x, HAB.z);
    mission(0);
    const runner = runnerAt();
    expect(eva().plan.tasks).toEqual(TASKS);
    expect(eva().plan.tasks).not.toBe(TASKS);   // a detached copy

    // a later re-plan cannot change what was approved
    useMissionStore.setState((state) => ({ route: { ...state.route, path: [[0, 0], [1, 1]], tasks: [] } }));
    expect(eva().plan.tasks).toHaveLength(3);

    useMissionStore.setState((state) => ({
      sampling: {
        ...state.sampling,
        samples: [
          { id: 1, kind: 'rock', site: 'Bright Angel', x: HAB.x - 101, z: HAB.z, into: 'pouch', atSec: 300 },
          { id: 2, kind: 'ground', site: null, x: HAB.x - 205, z: HAB.z, into: 'pouch', atSec: 500 },
          { id: 3, kind: 'ground', site: null, x: HAB.x - 150, z: HAB.z, into: 'case', atSec: 520 },
        ],
        photoLog: [{ x: 10, z: 10, kind: 'ground', site: null, atSec: 50 }],
      },
    }));
    place(HAB.x - 10, HAB.z);
    runner.tick();
    place(HAB.x, HAB.z);
    mission(600);
    runner.tick();
    requestEvaEnd(useMissionStore);
    runner.tick();

    const { summary } = eva();
    expect(summary.tasks.map((r) => [r.id, r.state, r.here, r.elsewhere, r.kept, r.atSec])).toEqual([
      ['t1', 'done', 1, 0, true, 300],
      ['t2', 'elsewhere', 1, 1, true, 520],
      ['t3', 'open', 0, 0, false, null],   // a photo 14 m from Cheyava Falls is not the photo asked for (decision 11)
    ]);
    expect(summary.tasks[1].distanceM).toBeCloseTo(50, 6);
    expect(Object.isFrozen(summary.tasks)).toBe(true);
    expect(Object.isFrozen(summary.tasks[0].place)).toBe(true);
    expect(Object.isFrozen(summary.plan.tasks[0])).toBe(true);
  });

  it('has no task rows for a goal without tasks, or a plan from before the field existed', () => {
    const { tasks, ...older } = ROUTE;
    expect(tasks).toHaveLength(3);
    useMissionStore.setState((state) => ({ route: { ...state.route, ...older, tasks: undefined } }));
    place(HAB.x, HAB.z);
    const runner = runnerAt();
    expect(eva().plan.tasks).toEqual([]);
    place(HAB.x - 10, HAB.z);
    runner.tick();
    place(HAB.x, HAB.z);
    runner.tick();
    requestEvaEnd(useMissionStore);
    runner.tick();
    expect(eva().summary.tasks).toEqual([]);
  });
});
