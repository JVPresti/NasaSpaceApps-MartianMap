import { describe, expect, it } from 'vitest';
import hazards from '../../public/data/hazards.json';
import { suitConstantsFromHazards } from './suitModel.js';
import { startConsumables } from './legCosts.js';
import { startSuitRunner, startSuitState } from './suitRunner.js';

const constants = suitConstantsFromHazards(hazards);

function memoryStore(state) {
  let current = {
    mission: { paused: false },
    navigation: { x: 0, z: 0 },
    route: { path: null },
    suit: {},
    sources: {},
    ...state,
  };
  return {
    getState: () => current,
    setState: (updater) => {
      const patch = typeof updater === 'function' ? updater(current) : updater;
      current = { ...current, ...patch };
    },
  };
}

function start(store, habitat) {
  return startSuitRunner({
    store,
    heightAt: () => 0,
    constants,
    habitat,
    now: () => 0,
    setInterval: () => 1,
    clearInterval: () => {},
  });
}

describe('suit runner walkback target', () => {
  it('uses the supplied habitat entry', () => {
    const far = memoryStore();
    const farRunner = start(far, { id: 'HAB', x: 535.1, z: 574.1 });
    farRunner.tick();
    const farWalkback = far.getState().suit.walkbackSec;

    const near = memoryStore();
    const nearRunner = start(near, { id: 'HAB', x: 0, z: 0 });
    nearRunner.tick();

    expect(farWalkback).toBeGreaterThan(0);
    expect(near.getState().suit.walkbackSec).toBe(0);
    farRunner.stop();
    nearRunner.stop();
  });

  it('falls back to DEFAULT_HABITAT when no shelters have loaded', () => {
    const store = memoryStore();
    const runner = start(store, undefined);
    runner.tick();
    // DEFAULT_HABITAT is (520, 600), so the walkback is not zero from the origin.
    expect(store.getState().suit.walkbackSec).toBeGreaterThan(0);
    runner.stop();
  });
});

describe('suit runner start consumables', () => {
  it('starts full without start values', () => {
    const store = memoryStore();
    const runner = start(store, { id: 'HAB', x: 0, z: 0 });
    runner.tick();
    expect(store.getState().suit.oxygenPct).toBeCloseTo(100, 6);
    expect(store.getState().suit.batteryPct).toBeCloseTo(100, 6);
    runner.stop();
  });

  it('starts from the O2 and battery the crew set at the mission table, as the plan does', () => {
    const { o2StartG, batteryStartWh } = startConsumables({ o2Pct: 60, batteryPct: 45 }, constants);
    const store = memoryStore();
    const runner = startSuitRunner({
      store, heightAt: () => 0, constants, habitat: { id: 'HAB', x: 0, z: 0 },
      start: { o2G: o2StartG, batteryWh: batteryStartWh },
      now: () => 0, setInterval: () => 1, clearInterval: () => {},
    });
    runner.tick();
    expect(store.getState().suit.oxygenPct).toBeCloseTo(60, 6);
    expect(store.getState().suit.batteryPct).toBeCloseTo(45, 6);
    runner.stop();
  });

  it('keeps start values within an empty and a full tank', () => {
    expect(startSuitState(constants, { o2G: -5, batteryWh: 1e9 })).toMatchObject({ o2G: 0, batteryWh: constants.batteryWh });
    expect(startSuitState(constants, { o2G: Number.NaN })).toMatchObject({ o2G: constants.o2UsableG });
  });
});
