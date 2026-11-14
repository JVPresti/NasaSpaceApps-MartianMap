import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInitialState, pauseMission, resetStore, resumeMission, setMode, useMissionStore } from './store.js';
import { departRoute, startSimulation } from './simulation.js';
import { startAtAirlock } from '../plan/routeStart.js';
import { nextTarget } from '../sim/waypointRunner.js';

const ENGINE = { heightAt: () => 0 };

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
  vi.useRealTimers();
  globalStorage.restore();
});

describe('startSimulation clock wiring', () => {
  it('starts the mission clock without waiting for hazards.json', () => {
    const fetchSpy = vi.fn(() => new Promise(() => {}));   // never settles
    vi.stubGlobal('fetch', fetchSpy);

    const stop = startSimulation(ENGINE);
    const mission = useMissionStore.getState().mission;
    // stops.json, hazards.json and shelters.json are requested in parallel; the clock does not wait for any of them.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
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
      navigation: { ...s.navigation, x: entry.x - 0.4, z: entry.z - 0.5, headingDeg: 323 },   // the engine's spawn
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
});
