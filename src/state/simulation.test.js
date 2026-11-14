import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import hazardsJson from '../../public/data/hazards.json';
import sheltersJson from '../../public/data/shelters.json';
import stopsJson from '../../public/data/stops.json';
import { resetStore, useMissionStore } from './store.js';
import { startSimulation } from './simulation.js';

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

describe('startSimulation EVA wiring', () => {
  it('starts the EVA runner only after the real shelters.json HAB loads, then ends on re-entry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    let answerShelters;
    const sheltersPromise = new Promise((resolve) => { answerShelters = resolve; });
    vi.stubGlobal('fetch', simulationFetch(sheltersPromise));

    const stop = startSimulation(ENGINE);
    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, x: 545.1, z: 574.1 } }));
    await vi.advanceTimersByTimeAsync(500);
    // The real HAB is still loading: the runner must not have started from the route waypoint (520, 600).
    expect(useMissionStore.getState().eva.phase).toBe('ready');

    answerShelters(jsonResponse(sheltersJson));
    await vi.advanceTimersByTimeAsync(0);
    const started = useMissionStore.getState();
    expect(started.eva.phase).toBe('active');
    expect(started.eva.startedAtSec).not.toBeNull();

    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, x: 535.1, z: 574.1 } }));
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

  it('never starts the EVA runner from a late shelter answer after the simulation stopped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    let answerShelters;
    const sheltersPromise = new Promise((resolve) => { answerShelters = resolve; });
    vi.stubGlobal('fetch', simulationFetch(sheltersPromise));

    const stop = startSimulation(ENGINE);
    stop();
    answerShelters(jsonResponse(sheltersJson));
    await vi.advanceTimersByTimeAsync(0);

    useMissionStore.setState((state) => ({ navigation: { ...state.navigation, x: 545.1, z: 574.1 } }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(useMissionStore.getState().eva.phase).toBe('ready');
    expect(useMissionStore.getState().eva.summary).toBeNull();
  });
});
