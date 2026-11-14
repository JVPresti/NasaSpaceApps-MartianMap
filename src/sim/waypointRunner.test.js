import { describe, expect, it } from 'vitest';
import { arrivalRadiusM, startWaypointRunner } from './waypointRunner.js';

function memoryStore(overrides = {}) {
  let state = {
    mode: 'walk',
    navigation: { x: 0, z: 0, headingDeg: 0, waypointRangeM: null, waypointBearingDeg: null },
    route: {
      waypoints: [
        { name: 'HAB', x: 0, z: 0 },
        { name: 'WP1 · channel floor', x: 30, z: 40 },
      ],
      nextIndex: 0,
      visited: [],
    },
    ...overrides,
  };
  return {
    getState: () => state,
    setState: (updater) => {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...patch };
    },
  };
}

function start(store) {
  return startWaypointRunner({ store, setInterval: () => 1, clearInterval: () => {} });
}

describe('arrival radius', () => {
  it('is 2 m at the science stops and 5 m elsewhere', () => {
    expect(arrivalRadiusM('Cheyava Falls')).toBe(2);
    expect(arrivalRadiusM('WP3 · Bright Angel outcrop')).toBe(2);
    expect(arrivalRadiusM('WP1 · channel floor')).toBe(5);
    expect(arrivalRadiusM(null)).toBe(5);
  });
});

describe('waypoint runner', () => {
  it('writes distance and bearing to the next waypoint', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    const runner = start(store);
    expect(store.getState().navigation.waypointRangeM).toBeCloseTo(50, 6);
    expect(store.getState().navigation.waypointBearingDeg).toBeCloseTo(143.13, 1);
    runner.stop();
  });

  it('advances a non-science waypoint inside 5 m and records it visited', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    store.getState().navigation.x = 25;
    store.getState().navigation.z = 40;
    const runner = start(store);
    runner.tick();
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toContain('WP1 · channel floor');
    runner.stop();
  });

  it('requires 2 m at a science target', () => {
    const store = memoryStore();
    store.getState().route.waypoints[1] = { name: 'Cheyava Falls', x: 0, z: 10 };
    store.getState().route.nextIndex = 1;
    store.getState().navigation.x = 0;
    store.getState().navigation.z = 7.9;
    const runner = start(store);
    runner.tick();
    expect(store.getState().route.nextIndex).toBe(1);

    store.getState().navigation.z = 8.1;
    runner.tick();
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toContain('Cheyava Falls');
    runner.stop();
  });

  it('does not advance in Plan mode or without a waypoint', () => {
    const plan = memoryStore({ mode: 'plan' });
    plan.getState().route.nextIndex = 1;
    const planRunner = start(plan);
    planRunner.tick();
    expect(plan.getState().route.nextIndex).toBe(1);
    planRunner.stop();

    const empty = memoryStore();
    empty.getState().route.waypoints = [];
    const emptyRunner = start(empty);
    emptyRunner.tick();
    expect(empty.getState().route.nextIndex).toBe(0);
    emptyRunner.stop();
  });
});
