import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import hazardsJson from '../../public/data/hazards.json';
import sheltersJson from '../../public/data/shelters.json';
import stopsJson from '../../public/data/stops.json';
import { createInitialState, pauseMission, resetStore, resumeMission, setMode, setNeeds, useMissionStore } from './store.js';
import { listEvents } from './events.js';
import { departRoute, startSimulation } from './simulation.js';
import { requestEvaEnd } from './eva.js';
import { startAtAirlock } from '../plan/routeStart.js';
import { nextTarget } from '../sim/waypointRunner.js';
import { resetDataFiles } from '../data/dataFiles.js';

const ENGINE = { heightAt: () => 0 };
const jsonResponse = (data) => ({ ok: true, json: async () => data });

function simulationFetch(sheltersResponse) {
  return vi.fn((url) => {
    const href = String(url);
    if (href.includes('shelters.json')) return sheltersResponse;
    if (href.includes('hazards.json')) return Promise.resolve(jsonResponse(hazardsJson));
    if (href.includes('stops.json')) return Promise.resolve(jsonResponse(stopsJson));
    return Promise.reject(new Error('unexpected fetch: ' + href));
  });
}

function installSessionStorage() {
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  return {
    storage,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
      else delete globalThis.sessionStorage;
    },
  };
}

let globalStorage;

beforeEach(() => {
  resetStore();
  globalStorage = installSessionStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDataFiles();
  vi.useRealTimers();
  globalStorage.restore();
});

describe('startSimulation clock wiring', () => {
  it('starts the mission clock without waiting for hazards.json', () => {
    const fetchSpy = vi.fn(() => new Promise(() => {}));   // never settles
    vi.stubGlobal('fetch', fetchSpy);

    const stop = startSimulation(ENGINE);
    const mission = useMissionStore.getState().mission;
    // stops.json, hazards.json, shelters.json, meda_sol.json and rad.json are requested in parallel; the clock does
    // not wait for any of them.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(mission.startedAtMs).not.toBeNull();
    expect(mission.sol).toBe(1210);
    expect(mission.lmst).toBe('17:45');
    expect(mission.timeScale).toBe(1);
    stop();
  });

  it('keeps the clock running when the hazards fetch fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const stop = startSimulation(ENGINE);
    const startedAt = useMissionStore.getState().mission.startedAtMs;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useMissionStore.getState().mission.startedAtMs).toBe(startedAt);
    expect(error).toHaveBeenCalledWith('suit model not started:', expect.any(Error));
    error.mockRestore();
    stop();
  });

  it('does nothing with ?mock=1: no fetch, no clock, no session', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const stop = startSimulation(ENGINE, { mock: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useMissionStore.getState().mission.startedAtMs).toBeNull();
    expect(globalStorage.storage.getItem('marswalk.missionClock.v1')).toBeNull();
    stop();
  });

  it('survives a StrictMode-style start, stop, start with one coherent session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const firstStop = startSimulation(ENGINE);
    const startedAt = useMissionStore.getState().mission.startedAtMs;
    vi.advanceTimersByTime(5000);
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(5, 6);
    firstStop();

    const secondStop = startSimulation(ENGINE);
    expect(useMissionStore.getState().mission.startedAtMs).toBe(startedAt);
    vi.advanceTimersByTime(5000);
    // Two controllers would still publish the same timestamp-derived value, never double it.
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(10, 6);
    secondStop();
  });
});

describe('EVA start at the first switch to Walk (#166)', () => {
  const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
  const files = {
    'hazards.json': read('../../public/data/hazards.json'),
    'shelters.json': read('../../public/data/shelters.json'),
    'stops.json': read('../../public/data/stops.json'),
  };
  const route = read('../../public/marswalk/assets/route.json');
  const entry = files['shelters.json'].shelters.find((s) => s.id === 'HAB');
  const respond = (url) => {
    const name = Object.keys(files).find((key) => String(url).endsWith(key));
    return Promise.resolve(name ? { ok: true, json: () => Promise.resolve(files[name]) } : { ok: false, status: 404 });
  };
  const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

  function planned() {
    // what Plan mode leaves in the store: the route from the airlock (routeStart.js), planned, nextIndex 0
    const waypoints = startAtAirlock(route.waypoints, files['shelters.json']);
    useMissionStore.setState((s) => ({
      route: { ...s.route, waypoints, path: waypoints.map((w) => [w.x, w.z]), nextIndex: 0, visited: [] },
      navigation: { ...s.navigation, trueX: entry.x - 0.4, trueZ: entry.z - 0.5, headingDeg: 323 },   // the engine's spawn
    }));
  }

  it('opens in Plan mode', () => {
    expect(createInitialState().mode).toBe('plan');
  });

  it('marks the first waypoint as the departure point', () => {
    const r = departRoute({ waypoints: route.waypoints, nextIndex: 0, visited: [] });
    expect(r.nextIndex).toBe(1);
    expect(r.visited).toEqual(['HAB']);
    expect(nextTarget(r).name).toBe(route.waypoints[1].name);
  });

  it('runs only the clock in Plan mode', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(respond));
    planned();
    const stop = startSimulation(ENGINE);
    await flush();
    vi.advanceTimersByTime(3000);
    const s = useMissionStore.getState();
    expect(s.mission.elapsedSec).toBeGreaterThan(0);
    expect(s.suit.oxygenPct).toBeNull();
    expect(s.navigation.fixMode).toBeNull();
    expect(s.navigation.waypointRangeM).toBeNull();
    expect(s.route.nextIndex).toBe(0);
    stop();
  });

  it('starts the clock, consumables, fix and next target fresh on the first Walk, once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(respond));
    planned();
    const stop = startSimulation(ENGINE);
    await flush();
    vi.advanceTimersByTime(60000);   // a minute at the planning table
    const planStart = useMissionStore.getState().mission.startedAtMs;

    setMode('walk');
    await flush();
    vi.advanceTimersByTime(1000);
    let s = useMissionStore.getState();
    expect(s.mission.startedAtMs).toBeGreaterThan(planStart);   // a new EVA: the bridge clears the boot prints
    expect(s.mission.elapsedSec).toBeCloseTo(1, 6);
    expect(s.navigation.fixMode).toBe('terrain fix');
    expect(s.navigation.lastFixSec).toBe(0);
    expect(s.route.nextIndex).toBe(1);
    expect(s.route.visited).toEqual(['HAB']);
    expect(s.navigation.waypointRangeM).toBeCloseTo(Math.hypot(route.waypoints[1].x - s.navigation.x, route.waypoints[1].z - s.navigation.z), 6);
    expect(s.suit.oxygenPct).toBeGreaterThan(99.9);
    expect(s.suit.batteryPct).toBeGreaterThan(99.9);
    expect(s.suit.walkbackSec).toBeLessThan(2);   // 0.6 m from the entry: the margin is at its maximum
    expect(Object.values(s.alerts).filter((a) => a?.active)).toEqual([]);

    const evaStart = s.mission.startedAtMs;
    setMode('plan');
    vi.advanceTimersByTime(2000);
    setMode('walk');
    vi.advanceTimersByTime(1000);
    s = useMissionStore.getState();
    expect(s.mission.startedAtMs).toBe(evaStart);   // later switches keep the EVA going
    expect(s.mission.elapsedSec).toBeCloseTo(4, 6);
    stop();
  });

  it('starts the suit from the O2 and battery the crew set at the table, and the events of its objective (#265)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(respond));
    planned();
    setNeeds({ objective: 'cheyava', o2Pct: 60, batteryPct: 45 });
    const stop = startSimulation(ENGINE);
    await flush();
    setMode('walk');   // Begin EVA locks the needs and starts the EVA from them
    await flush();
    vi.advanceTimersByTime(1000);
    const s = useMissionStore.getState();
    expect(s.needs.locked).toBe(true);
    expect(s.suit.oxygenPct).toBeCloseTo(60, 0);
    expect(s.suit.batteryPct).toBeCloseTo(45, 0);
    // the full EVA's times, read from the locked objective; a change now is refused and changes nothing
    expect(setNeeds({ objective: 'sortie' })).toBe(false);
    expect(listEvents().find((event) => event.id === 'dust-storm').trigger).toEqual({ type: 'missionTime', atSec: 480 });
    stop();
  });

  it('walks a crew of one without the partner, and a pair with it (D8)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(respond));
    const partnerState = { x: entry.x + 2, z: entry.z, headingDeg: 0, speedMs: 0, visible: true };
    const engineFor = () => ({
      heightAt: () => 0,
      setPartnerSource: vi.fn(),
      getPartner: vi.fn(() => ({ id: 'ev2', color: [1, 0.5, 0], state: partnerState })),
    });

    planned();
    setNeeds({ crew: 1 });
    const solo = engineFor();
    let stop = startSimulation(solo);
    await flush();
    setMode('walk');
    await flush();
    vi.advanceTimersByTime(2000);
    expect(solo.setPartnerSource).toHaveBeenCalledWith(null);
    expect(solo.getPartner).not.toHaveBeenCalled();     // no partner runner: no EV2 chip, no separation alert
    expect(useMissionStore.getState().crew).toEqual([]);
    stop();

    resetStore();
    planned();
    const pair = engineFor();
    stop = startSimulation(pair);
    await flush();
    setMode('walk');
    await flush();
    vi.advanceTimersByTime(2000);
    expect(pair.setPartnerSource).not.toHaveBeenCalled();
    expect(pair.getPartner).toHaveBeenCalled();
    stop();
  });

  it('keeps a paused mission paused at EVA 0:00 when Walk starts behind a menu (#64)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(respond));
    planned();
    const stop = startSimulation(ENGINE);
    pauseMission();
    vi.advanceTimersByTime(5000);
    setMode('walk');
    vi.advanceTimersByTime(5000);
    let s = useMissionStore.getState();
    expect(s.mission.paused).toBe(true);
    expect(s.mission.elapsedSec).toBe(0);
    expect(s.route.nextIndex).toBe(1);
    resumeMission();
    vi.advanceTimersByTime(2000);
    s = useMissionStore.getState();
    expect(s.mission.elapsedSec).toBeCloseTo(2, 6);
    stop();
  });

  it('replays MEDA weather and sums the RAD dose from the first Walk, with a source for each value (#189)', async () => {
    vi.useFakeTimers();
    const withEnvironment = {
      ...files,
      'meda_sol.json': read('../../public/data/meda_sol.json'),
      'rad.json': read('../../public/data/rad.json'),
    };
    vi.stubGlobal('fetch', vi.fn((url) => {
      const name = Object.keys(withEnvironment).find((key) => String(url).endsWith(key));
      return Promise.resolve(name ? { ok: true, json: () => Promise.resolve(withEnvironment[name]) } : { ok: false, status: 404 });
    }));
    planned();
    // The background values over 6 min: the full EVA, whose first event comes at T+480 s (the first mission's storm would
    // come by T+240 s and its opacity is SIM).
    setNeeds({ objective: 'cheyava' });
    const stop = startSimulation(ENGINE);
    await flush();
    vi.advanceTimersByTime(5000);
    expect(useMissionStore.getState().environment.tempC).toBeNull();   // Plan mode: no EVA yet

    setMode('walk');
    await flush();
    vi.advanceTimersByTime(360000);   // 6 min of EVA
    const s = useMissionStore.getState();
    expect(Number.isFinite(s.environment.tempC)).toBe(true);
    expect(Number.isFinite(s.environment.windMs)).toBe(true);
    expect(s.environment.dustOpacity).toBe(0.45);
    expect(s.environment.doseUgy).toBeCloseTo(8.75 * 0.1, 1);   // 6 min at the RAD background, 8.75 µGy/h
    for (const path of ['environment.tempC', 'environment.windMs', 'environment.dustOpacity', 'environment.doseUgy']) {
      expect(s.sources[path]?.tag).toMatch(/^(DATA|DERIVED)$/);
    }
    stop();
  });
});

describe('startSimulation EVA wiring', () => {
  it('starts the EVA runner on the first Walk once the real shelters.json HAB loads, then ends at the habitat when asked (#244)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    let answerShelters;
    const sheltersPromise = new Promise((resolve) => { answerShelters = resolve; });
    vi.stubGlobal('fetch', simulationFetch(sheltersPromise));

    const stop = startSimulation(ENGINE);
    setMode('walk');   // the EVA, and its statistics, start on the first Walk (#166)
    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, trueX: 545.1, trueZ: 574.1 } }));
    await vi.advanceTimersByTimeAsync(500);
    // The real HAB is still loading: the runner must not have started from the route waypoint (520, 600).
    expect(useMissionStore.getState().eva.phase).toBe('ready');

    answerShelters(jsonResponse(sheltersJson));
    await vi.advanceTimersByTimeAsync(0);
    const started = useMissionStore.getState();
    expect(started.eva.phase).toBe('active');
    expect(started.eva.startedAtSec).not.toBeNull();

    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, trueX: 535.1, trueZ: 574.1 } }));
    await vi.advanceTimersByTimeAsync(300);
    expect(useMissionStore.getState().eva).toMatchObject({ phase: 'active', atHabitat: true });   // back, not ended
    expect(requestEvaEnd(useMissionStore)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);

    const ended = useMissionStore.getState();
    expect(ended.eva.phase).toBe('ended');
    expect(ended.mission.paused).toBe(true);
    expect(ended.eva.summary).toMatchObject({
      startedAtSec: started.eva.startedAtSec,
      endedAtSec: ended.eva.endedAtSec,
      sampleCount: 0,
      samples: [],
      doseUgy: null,
      doseRateUgyH: null,
    });
    expect(ended.eva.summary.distanceM).toBeGreaterThan(0);
    expect(Object.isFrozen(ended.eva.summary)).toBe(true);
    stop();
  });

  it('still starts the EVA runner when shelters.json fails, so the EVA can be finished from the cabin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.stubGlobal('fetch', simulationFetch(Promise.reject(new Error('shelters.json: 404'))));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const CABIN = { x: 541, z: 582 };
    const engine = { ...ENGINE, habitatZoneAt: (x, z) => (Math.hypot(x - CABIN.x, z - CABIN.z) < 2 ? 'main' : null) };

    const stop = startSimulation(engine);
    setMode('walk');
    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, trueX: 500, trueZ: 600 } }));
    await vi.advanceTimersByTimeAsync(300);
    expect(useMissionStore.getState().eva).toMatchObject({ phase: 'active', atHabitat: false });

    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, trueX: CABIN.x, trueZ: CABIN.z } }));
    await vi.advanceTimersByTimeAsync(300);
    expect(useMissionStore.getState().eva).toMatchObject({ phase: 'active', atHabitat: true });
    expect(requestEvaEnd(useMissionStore)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(useMissionStore.getState().eva.phase).toBe('ended');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('shelters.json not loaded'));
    stop();
    error.mockRestore();
  });

  it('never starts the EVA runner from a late shelter answer after the simulation stopped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    let answerShelters;
    const sheltersPromise = new Promise((resolve) => { answerShelters = resolve; });
    vi.stubGlobal('fetch', simulationFetch(sheltersPromise));

    const stop = startSimulation(ENGINE);
    setMode('walk');
    stop();
    answerShelters(jsonResponse(sheltersJson));
    await vi.advanceTimersByTimeAsync(0);

    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, trueX: 545.1, trueZ: 574.1 } }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(useMissionStore.getState().eva.phase).toBe('ready');
    expect(useMissionStore.getState().eva.summary).toBeNull();
  });
});
