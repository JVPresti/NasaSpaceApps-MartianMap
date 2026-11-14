import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore, useMissionStore } from './store.js';
import { startSimulation } from './simulation.js';

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
    // hazards.json and shelters.json are requested in parallel; the clock does not wait for either.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
