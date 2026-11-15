import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventEngine } from '../sim/eventEngine.js';
import exampleEvent from '../sim/events/example-event.json';
import { LOOK_DEFAULTS, LOOK_STORAGE_KEY } from '../engine/lookSettings.js';
import { applySavedRoute, chooseRouteProfile, createInitialState, deleteSavedRoute, resetStore, saveCurrentRoute, saveEvaRoute, setLookSettings, setMode, setNeeds, setRouteDecision, setTasks, storeAdapter, useMissionStore, withRouteProfile } from './store.js';
import { createMockState } from './mock.js';
import { beginEgress } from './flow.js';

beforeEach(() => resetStore());

describe('store adapter (docs/EVENT_ENGINE.md contract)', () => {
  it('reads and writes dot paths', () => {
    storeAdapter.set('suit.oxygenSec', 3600);
    expect(storeAdapter.get('suit.oxygenSec')).toBe(3600);
    expect(useMissionStore.getState().suit.oxygenSec).toBe(3600);
  });

  it('creates intermediate objects and returns undefined for missing paths', () => {
    storeAdapter.set('alerts.dust-storm', { id: 'dust-storm', level: 'warning' });
    expect(storeAdapter.get('alerts.dust-storm.level')).toBe('warning');
    expect(storeAdapter.get('nothing.here')).toBeUndefined();
  });

  it('keeps arrays as arrays', () => {
    useMissionStore.setState({ crew: [{ id: 'EV2', x: 1 }] });
    storeAdapter.set('crew.0.x', 5);
    expect(Array.isArray(useMissionStore.getState().crew)).toBe(true);
    expect(useMissionStore.getState().crew[0]).toEqual({ id: 'EV2', x: 5 });
  });

  it('writes immutably, so selectors on parent objects see a change', () => {
    const before = useMissionStore.getState().suit;
    storeAdapter.set('suit.batteryPct', 50);
    expect(useMissionStore.getState().suit).not.toBe(before);
    expect(before.batteryPct).toBeNull();
  });

  it('notifies subscribers on set', () => {
    const seen = [];
    const off = useMissionStore.subscribe((s) => seen.push(s.environment.dustOpacity));
    storeAdapter.set('environment.dustOpacity', 0.4);
    off();
    expect(seen).toEqual([0.4]);
  });

  it('rejects prototype paths and empty segments', () => {
    for (const bad of ['__proto__.x', 'suit.constructor', 'a..b', '', 'prototype']) expect(() => storeAdapter.set(bad, 1)).toThrow();
    expect(({}).x).toBeUndefined();
  });

  it('returns a detached snapshot', () => {
    const snap = storeAdapter.snapshot();
    snap.suit.oxygenPct = 1;
    expect(useMissionStore.getState().suit.oxygenPct).toBeNull();
    expect(Object.keys(snap)).toEqual(Object.keys(createInitialState()));
  });
});

describe('event engine on the real store', () => {
  it('runs the example event end to end and clears its alert', () => {
    let t = 0;
    const engine = createEventEngine({ store: storeAdapter, events: [exampleEvent], getMissionTime: () => t });
    engine.fire('demo-alarm');
    engine.update(t);
    expect(storeAdapter.get('alerts.demo-alarm.active')).toBe(true);
    expect(storeAdapter.get('environment.dustOpacity')).toBe(0.1);
    t = 11;
    engine.update(t);
    expect(storeAdapter.get('alerts.demo-alarm')).toBeNull();
    expect(storeAdapter.get('environment.dustOpacity')).toBe(0);
  });
});

describe('actions and mock data', () => {
  it('only accepts walk or plan as the mode', () => {
    setMode('plan');
    expect(useMissionStore.getState().mode).toBe('plan');
    expect(() => setMode('orbit')).toThrow();
  });

  it('only accepts the three go / no-go decisions', () => {
    expect(useMissionStore.getState().route.decision).toBe('pending');
    setRouteDecision('go');
    expect(useMissionStore.getState().route.decision).toBe('go');
    setRouteDecision('no-go');
    expect(useMissionStore.getState().route.decision).toBe('no-go');
    expect(() => setRouteDecision('maybe')).toThrow();
  });

  it('tags every mock value SIM', () => {
    const mock = createMockState();
    const tags = new Set(Object.values(mock.sources).map((s) => s.tag));
    expect([...tags]).toEqual(['SIM']);
    expect(mock.sources['suit.oxygenPct']).toBeDefined();
    expect(mock.route.path.length).toBe(5);
  });
});

describe('look settings (#102)', () => {
  // resetStore() keeps the preference on purpose, so each case puts the defaults back instead of relying on it.
  afterEach(() => {
    useMissionStore.setState((s) => ({ settings: { ...s.settings, look: { ...LOOK_DEFAULTS } } }));
    vi.unstubAllGlobals();
  });

  it('starts from the defaults in a fresh state', () => {
    expect(createInitialState().settings.look).toEqual(LOOK_DEFAULTS);
    expect(createInitialState().settings.look).not.toBe(LOOK_DEFAULTS);   // a private copy, not the frozen default
    expect(useMissionStore.getState().settings.look).toEqual(LOOK_DEFAULTS);
  });

  it('clamps the sensitivity, rounds it and keeps the inverted axis', () => {
    expect(setLookSettings({ sensitivity: 3, invertY: true })).toEqual({ sensitivity: 2, invertY: true });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 2, invertY: true });
    expect(setLookSettings({ sensitivity: 1.44 })).toEqual({ sensitivity: 1.4, invertY: true });
  });

  it('applies a partial patch and keeps the other field', () => {
    setLookSettings({ sensitivity: 0.8 });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 0.8, invertY: false });
    setLookSettings({ invertY: true });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 0.8, invertY: true });
    expect(setLookSettings(undefined)).toEqual({ sensitivity: 0.8, invertY: true });
  });

  it('saves the clamped value in this browser', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    setLookSettings({ sensitivity: 1.7, invertY: true });
    expect(setItem).toHaveBeenCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":1.7,"invertY":true}');
    setLookSettings({ sensitivity: 9 });
    expect(setItem).toHaveBeenLastCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":2,"invertY":true}');
  });

  it('still applies for the session when storage refuses the write', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(setLookSettings({ sensitivity: 1.5 })).toEqual({ sensitivity: 1.5, invertY: false });
    expect(useMissionStore.getState().settings.look.sensitivity).toBe(1.5);
  });

  it('keeps the preference across a reset while the mission state goes back to its defaults', () => {
    setLookSettings({ sensitivity: 1.6, invertY: true });
    setMode('walk');
    storeAdapter.set('suit.oxygenSec', 3600);
    resetStore();
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 1.6, invertY: true });
    expect(useMissionStore.getState().mode).toBe('walk');   // on foot in the habitat
    expect(useMissionStore.getState().stage).toBe('habitat');
    expect(useMissionStore.getState().suit.oxygenSec).toBeNull();
    expect(useMissionStore.getState().mission.elapsedSec).toBe(0);
  });

  it('re-reads the saved value on a fresh page load and falls back when it is corrupt', async () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sensitivity: 1.3, invertY: true }) });
    vi.resetModules();
    const fresh = await import('./store.js');
    expect(fresh.useMissionStore.getState().settings.look).toEqual({ sensitivity: 1.3, invertY: true });
    expect(fresh.createInitialState().settings.look).toEqual(LOOK_DEFAULTS);

    vi.stubGlobal('localStorage', { getItem: () => '{ not json' });
    vi.resetModules();
    expect((await import('./store.js')).useMissionStore.getState().settings.look).toEqual(LOOK_DEFAULTS);
  });
});

describe('route profiles (#245)', () => {
  const profile = (id, x) => ({ id, ok: true, path: [[0, 0], [x, 0]], distanceM: x, climbM: 1, steepestSlopeDeg: 10, overCautionM: 0, timeSec: x, o2G: 1, shadowShare: 0.5 });
  const profiles = { fastest: profile('fastest', 100), gentlest: profile('gentlest', 120), radio: { id: 'radio', ok: false, reason: 'no-mast' } };

  it('starts on the fastest profile with none planned', () => {
    expect(createInitialState().route).toMatchObject({ profiles: null, profile: 'fastest' });
  });

  it('makes the chosen profile the route: path, numbers and a fresh start', () => {
    useMissionStore.setState((s) => ({ route: { ...s.route, profiles, path: profiles.fastest.path, nextIndex: 2, visited: ['WP1'] } }));
    chooseRouteProfile('gentlest');
    const { route } = useMissionStore.getState();
    expect(route.profile).toBe('gentlest');
    expect(route.path).toBe(profiles.gentlest.path);
    expect(route).toMatchObject({ distanceM: 120, climbM: 1, steepestSlopeDeg: 10, etaSec: 120, nextIndex: 0, visited: [] });
  });

  it('ignores a profile without a route', () => {
    useMissionStore.setState((s) => ({ route: { ...s.route, profiles, path: profiles.fastest.path } }));
    const before = useMissionStore.getState();
    chooseRouteProfile('radio');
    chooseRouteProfile('nonsense');
    expect(useMissionStore.getState()).toBe(before);
    expect(withRouteProfile({ profiles }, 'radio')).toBeNull();
    expect(withRouteProfile({ profiles: null }, 'fastest')).toBeNull();
  });

  it('does not restart the walk when the profile in use is chosen again', () => {
    useMissionStore.setState((s) => ({ route: { ...s.route, profiles, profile: 'fastest', path: profiles.fastest.path, nextIndex: 2 } }));
    const before = useMissionStore.getState();
    chooseRouteProfile('fastest');
    expect(useMissionStore.getState()).toBe(before);
  });
});

describe('the needs of the crew (#265)', () => {
  it('starts on the first sortie for a pair, unlocked', () => {
    expect(createInitialState().needs).toEqual({ objective: 'sortie', crew: 2, timeMin: 30, o2Pct: 100, batteryPct: 100, risk: 'standard', tasks: [], locked: false });
    expect(createInitialState().route).toMatchObject({ stops: [], dropped: [], planReasons: [], budget: null, weights: null, explain: [], tasks: [] });
    expect(createInitialState().sampling.photoLog).toEqual([]);
  });

  it('applies a partial update, clamps numbers and refuses unknown values', () => {
    expect(setNeeds({ crew: 1, timeMin: 30, risk: 'cautious' })).toBe(true);
    expect(useMissionStore.getState().needs).toMatchObject({ objective: 'sortie', crew: 1, timeMin: 30, risk: 'cautious' });
    expect(setNeeds({ o2Pct: 50 })).toBe(true);
    expect(setNeeds({ o2Pct: 250 })).toBe(true);
    expect(useMissionStore.getState().needs.o2Pct).toBe(100);
    expect(() => setNeeds({ crew: 4 })).toThrow(/crew/);
    expect(() => setNeeds({ profile: 'radio' })).toThrow(/unknown need/);
  });

  it('keeps the same object when nothing changes, so the route does not re-plan', () => {
    const before = useMissionStore.getState().needs;
    expect(setNeeds({ objective: 'sortie', crew: 2 })).toBe(false);
    expect(useMissionStore.getState().needs).toBe(before);
  });

  it('locks the needs at Begin EVA, not when walking in the habitat, until a restart (#260)', () => {
    setNeeds({ objective: 'cheyava' });
    setMode('walk');   // on foot in the habitat: still editable
    expect(useMissionStore.getState().needs.locked).toBe(false);
    setMode('plan');
    beginEgress();
    expect(useMissionStore.getState().needs.locked).toBe(true);
    expect(setNeeds({ objective: 'bright-angel', timeMin: 60 })).toBe(false);
    expect(useMissionStore.getState().needs).toMatchObject({ objective: 'cheyava', timeMin: 120 });
    resetStore();
    expect(useMissionStore.getState().needs.locked).toBe(false);
  });

  it('gives a new objective its default time, unless the update sets one', () => {
    setNeeds({ objective: 'cheyava' });
    expect(useMissionStore.getState().needs).toMatchObject({ objective: 'cheyava', timeMin: 120 });
    setNeeds({ timeMin: 90 });
    setNeeds({ crew: 1 });
    expect(useMissionStore.getState().needs.timeMin).toBe(90);   // only a new objective resets the time
    setNeeds({ objective: 'sortie', timeMin: 45 });
    expect(useMissionStore.getState().needs).toMatchObject({ objective: 'sortie', timeMin: 45 });
    setNeeds({ objective: 'bright-angel' });
    expect(useMissionStore.getState().needs.timeMin).toBe(120);
  });

  it('holds a solo crew to the radio-contact route while it has one', () => {
    const route = (id) => ({ id, ok: true, path: [[0, 0], [id.length, 0]], distanceM: 1, climbM: 0, steepestSlopeDeg: 1, timeSec: 1, explain: [{ to: 'B', clear: true, block: null }] });
    const profiles = { fastest: route('fastest'), gentlest: route('gentlest'), radio: route('radio') };
    useMissionStore.setState((s) => ({ route: { ...withRouteProfile({ ...s.route, profiles }, 'radio') } }));
    setNeeds({ crew: 1 });
    chooseRouteProfile('fastest');
    expect(useMissionStore.getState().route.path).toBe(profiles.radio.path);
    setNeeds({ crew: 2 });
    chooseRouteProfile('fastest');
    expect(useMissionStore.getState().route.path).toBe(profiles.fastest.path);
    expect(useMissionStore.getState().route.explain).toBe(profiles.fastest.explain);
  });

  it('keeps the needs and the profile across a Restart, unlocked, and starts the rest over (D9)', () => {
    setNeeds({ objective: 'cheyava', crew: 1, timeMin: 90, o2Pct: 80, batteryPct: 70, risk: 'cautious' });
    useMissionStore.setState((s) => ({ route: { ...s.route, profile: 'gentlest', path: [[0, 0], [1, 0]] }, hazards: { ...s.hazards, off: ['dust-storm'] } }));
    setMode('walk');
    resetStore({ keepNeeds: true });
    const state = useMissionStore.getState();
    expect(state.needs).toEqual({ objective: 'cheyava', crew: 1, timeMin: 90, o2Pct: 80, batteryPct: 70, risk: 'cautious', tasks: [], locked: false });
    expect(state.route).toMatchObject({ profile: 'gentlest', path: null, stops: [] });
    expect(state.hazards.off).toEqual([]);   // the hazard switches start over, as on main
    expect(state.mode).toBe('walk');   // a new EVA starts on foot in the habitat (#260)
    expect(setNeeds({ timeMin: 60 })).toBe(true);   // unlocked
    // a plain reset, as a page load, opens the first sortie
    resetStore();
    expect(useMissionStore.getState().needs).toEqual(createInitialState().needs);
    expect(useMissionStore.getState().route.profile).toBe('fastest');
  });

  it('gives the profile chosen for a pair back when the crew goes from one astronaut to two (P22)', () => {
    const route = (id) => ({ id, ok: true, path: [[0, 0], [id.length, 0]], distanceM: 1, climbM: 0, steepestSlopeDeg: 1, timeSec: 1, explain: [] });
    const profiles = { fastest: route('fastest'), gentlest: route('gentlest'), radio: route('radio') };
    useMissionStore.setState((s) => ({ route: withRouteProfile({ ...s.route, profiles }, 'fastest') }));
    chooseRouteProfile('gentlest');
    setNeeds({ crew: 1 });
    // the planner walks a solo crew on the radio route and keeps route.profile (useRoutePlanner); a click changes nothing
    useMissionStore.setState((s) => ({ route: { ...withRouteProfile(s.route, 'radio'), profile: s.route.profile } }));
    chooseRouteProfile('radio');
    chooseRouteProfile('fastest');
    expect(useMissionStore.getState().route.profile).toBe('gentlest');
    expect(useMissionStore.getState().route.path).toBe(profiles.radio.path);
    setNeeds({ crew: 2 });
    expect(useMissionStore.getState().route.profile).toBe('gentlest');   // what the next plan walks (missionNeeds)
  });
});

describe('the sampling tasks (#352)', () => {
  const rock = { id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } };
  const photo = { id: 't2', what: 'photo', count: 2, place: { type: 'point', id: 'P1', x: 500.123, z: 560 } };

  it('stores a checked copy of the list, and says when nothing changed', () => {
    expect(setTasks([rock, { ...photo, count: 7 }])).toBe(true);
    const { tasks } = useMissionStore.getState().needs;
    expect(tasks).toEqual([rock, { ...photo, count: 3, place: { ...photo.place, x: 500.12 } }]);
    expect(tasks[0]).not.toBe(rock);
    const before = useMissionStore.getState().needs;
    expect(setTasks([rock, { ...photo, count: 3 }])).toBe(false);
    expect(useMissionStore.getState().needs).toBe(before);
    expect(setTasks([])).toBe(true);
    expect(useMissionStore.getState().needs.tasks).toEqual([]);
  });

  it('refuses a bad list, and changes nothing once the EVA has begun', () => {
    expect(() => setTasks([rock, rock])).toThrow(/duplicate/);
    expect(() => setTasks('rock')).toThrow(/array/);
    setTasks([rock]);
    setMode('walk');
    expect(setTasks([photo])).toBe(false);
    expect(useMissionStore.getState().needs.tasks).toEqual([rock]);
  });

  it('gives "Collect samples" one rock sample at Bright Angel when chosen with no task, and 2 h (PO Q1)', () => {
    expect(setNeeds({ objective: 'samples' })).toBe(true);
    expect(useMissionStore.getState().needs).toMatchObject({ objective: 'samples', timeMin: 120, tasks: [rock] });
    expect(Object.isFrozen(useMissionStore.getState().needs.tasks[0])).toBe(false);
    setTasks([rock, photo]);
    setNeeds({ objective: 'cheyava' });
    setNeeds({ objective: 'samples' });
    expect(useMissionStore.getState().needs.tasks.map((t) => t.id)).toEqual(['t1', 't2']);   // the crew's own list stays
    setTasks([]);
    setNeeds({ crew: 1 });
    expect(useMissionStore.getState().needs.tasks).toEqual([]);   // only choosing the goal pre-fills
  });

  it('keeps the tasks across a Restart, and a page load starts with none', () => {
    setTasks([rock, photo]);
    setMode('walk');
    resetStore({ keepNeeds: true });
    expect(useMissionStore.getState().needs).toMatchObject({ locked: false, tasks: [rock, { ...photo, place: { ...photo.place, x: 500.12 } }] });
    resetStore();
    expect(useMissionStore.getState().needs.tasks).toEqual([]);
  });
});

describe('saved routes (#357)', () => {
  const waypoints = [{ name: 'HAB', x: 0, z: 0 }, { name: 'S1', x: 100, z: 0, workSec: 600, stopId: 's1', required: true }];
  const path = [[0, 0], [50, 0], [100, 0]];
  const plan = (s) => ({ route: { ...s.route, waypoints, path, distanceM: 100, climbM: 2, steepestSlopeDeg: 17 } });
  const empty = () => useMissionStore.setState({ routeLibrary: { list: [] } });

  it('saves the plan under a name, with the work at the stops and an empty record', () => {
    empty();
    useMissionStore.setState(plan);
    expect(saveCurrentRoute('  Ridge ')).toEqual(expect.objectContaining({ name: 'Ridge' }));
    const [entry] = useMissionStore.getState().routeLibrary.list;
    expect(entry).toMatchObject({ name: 'Ridge', distanceM: 100, climbM: 2, waypoints, path });
    expect(entry.risk).toEqual({ maxSlopeDeg: 17, climbM: 2, level: 'caution' });
    expect(entry.record).toMatchObject({ attempts: 0, completed: 0, samples: 0, distanceM: 0 });
  });

  it('refuses a save without a name or without a plan', () => {
    empty();
    expect(saveCurrentRoute('Ridge')).toBeNull();
    useMissionStore.setState(plan);
    expect(saveCurrentRoute('   ')).toBeNull();
    expect(useMissionStore.getState().routeLibrary.list).toEqual([]);
  });

  it('saves the route an EVA ended on and counts that EVA as its first run (#364)', () => {
    empty();
    const find = { name: 'Find · shiny rock', x: 100, z: 20 };
    const walked = [...waypoints, find];
    useMissionStore.setState((s) => ({
      route: { ...s.route, waypoints: walked, path, distanceM: 100, climbM: 2, steepestSlopeDeg: 17, visited: walked.map((w) => w.name) },
    }));
    const entry = saveEvaRoute('EVA ridge', { sampleCount: 2, distanceM: 870.5, doseUgy: 6.2 });
    expect(entry).toEqual(expect.objectContaining({ name: 'EVA ridge' }));
    const [saved] = useMissionStore.getState().routeLibrary.list;
    expect(saved.waypoints).toEqual(walked);
    expect(saved.record).toEqual({ attempts: 1, completed: 1, samples: 2, distanceM: 870.5, doseUgy: 6.2, lastRunAtMs: expect.any(Number) });
  });

  it('flags the run as not completed when a waypoint was left out, and still saves', () => {
    empty();
    useMissionStore.setState((s) => ({
      route: { ...s.route, waypoints, path, distanceM: 100, climbM: 2, steepestSlopeDeg: 17, visited: ['HAB'] },
    }));
    expect(saveEvaRoute('Ridge', { sampleCount: 0, distanceM: 120, doseUgy: null })).toEqual(expect.objectContaining({ name: 'Ridge' }));
    expect(useMissionStore.getState().routeLibrary.list[0].record).toMatchObject({ attempts: 1, completed: 0, samples: 0, distanceM: 120, doseUgy: null });
  });

  it('refuses a debrief save without a plan and never records a run', () => {
    empty();
    expect(saveEvaRoute('Ridge', { sampleCount: 1, distanceM: 50, doseUgy: 1 })).toBeNull();
    expect(useMissionStore.getState().routeLibrary.list).toEqual([]);
  });

  it('puts a saved route back on the table and holds the needs plan off until a need changes', () => {
    empty();
    useMissionStore.setState(plan);
    saveCurrentRoute('Ridge');
    const id = useMissionStore.getState().routeLibrary.list[0].id;
    useMissionStore.setState((s) => ({
      route: { ...s.route, waypoints: [{ name: 'Elsewhere', x: 9, z: 9 }], path: [[9, 9], [8, 8]], decision: 'no-go', nextIndex: 1, visited: ['Elsewhere'] },
    }));
    expect(applySavedRoute(id)).toBe(true);
    expect(useMissionStore.getState().route).toMatchObject({
      waypoints, path, manual: true, decision: 'pending', distanceM: 100, climbM: 2, steepestSlopeDeg: 17, nextIndex: 0, visited: [], skipped: [],
    });
    expect(applySavedRoute('nope')).toBe(false);
    setNeeds({ crew: 1 });
    expect(useMissionStore.getState().route.manual).toBe(false);
  });

  it("clears the old needs plan's stops, dropped stops, reasons and leg explanations when a saved route loads", () => {
    empty();
    useMissionStore.setState(plan);
    saveCurrentRoute('Ridge');
    const id = useMissionStore.getState().routeLibrary.list[0].id;
    // The needs plan that was on the table before: it dropped Bright Angel for lack of time.
    useMissionStore.setState((s) => ({
      route: {
        ...s.route,
        stops: [{ id: 'cheyava-falls' }],
        dropped: [{ id: 'bright-angel', reason: 'time' }],
        planReasons: [{ kind: 'dropped', stop: 'bright-angel', reason: 'time' }],
        explain: [{ leg: 0, why: 'slope' }],
      },
    }));
    expect(applySavedRoute(id)).toBe(true);
    expect(useMissionStore.getState().route).toMatchObject({ stops: [], dropped: [], planReasons: [], explain: [] });
  });

  it('deletes one saved route and keeps the library across a restart', () => {
    empty();
    useMissionStore.setState(plan);
    saveCurrentRoute('Ridge');
    useMissionStore.setState(plan);
    saveCurrentRoute('Valley');
    const [newest, oldest] = useMissionStore.getState().routeLibrary.list;
    expect(newest.name).toBe('Valley');
    resetStore();
    expect(useMissionStore.getState().routeLibrary.list.map((e) => e.name)).toEqual(['Valley', 'Ridge']);
    expect(deleteSavedRoute(oldest.id)).toBe(true);
    expect(useMissionStore.getState().routeLibrary.list.map((e) => e.name)).toEqual(['Valley']);
    expect(deleteSavedRoute('nope')).toBe(false);
  });
});
