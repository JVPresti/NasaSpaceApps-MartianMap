import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStops } from '../data/stops.js';
import { arrivalRadiusM, nextTarget, startWaypointRunner, WAYPOINT_SOURCES } from './waypointRunner.js';

const STOPS = parseStops(JSON.parse(readFileSync(join(import.meta.dirname, '../../public/data/stops.json'), 'utf8')));
const HAB_SHELTER = { id: 'HAB', name: 'HAB · habitat airlock', type: 'habitat', x: 535.1, z: 574.1 };

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
      skipped: [],
      shelter: null,
    },
    sources: {},
    ...overrides,
  };
  let writes = 0;
  return {
    getState: () => state,
    setState: (updater) => {
      writes += 1;
      const patch = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...patch };
    },
    writes: () => writes,
  };
}

function start(store, stops = STOPS) {
  return startWaypointRunner({ store, stops, setInterval: () => 1, clearInterval: () => {} });
}

function moveTo(store, x, z) {
  const s = store.getState();
  s.navigation = { ...s.navigation, x, z };
}

describe('arrival radius', () => {
  it('comes from arrival_radius in stops.json at the science stops and is 5 m elsewhere', () => {
    expect(arrivalRadiusM(STOPS, { name: 'Cheyava Falls' })).toBe(2);
    expect(arrivalRadiusM(STOPS, { name: 'WP3 · Bright Angel outcrop' })).toBe(2);
    expect(arrivalRadiusM(STOPS, { name: 'WP1 · channel floor' })).toBe(5);
    expect(arrivalRadiusM(STOPS, null)).toBe(5);
    expect(arrivalRadiusM([], { name: 'Cheyava Falls' })).toBe(5);   // before stops.json loads
  });
});

describe('next target', () => {
  const waypoints = [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1', x: 10, z: 0 }, { name: 'WP2', x: 20, z: 0 }];

  it('is null without a route and complete after the last waypoint', () => {
    expect(nextTarget({ waypoints: [] })).toBeNull();
    expect(nextTarget(undefined)).toBeNull();
    expect(nextTarget({ waypoints, nextIndex: 3 })).toEqual({ kind: 'complete', index: 3 });
  });

  it('leaves out skipped names and prefers the shelter', () => {
    expect(nextTarget({ waypoints, nextIndex: 1, skipped: ['WP1'] })).toMatchObject({ kind: 'waypoint', index: 2, name: 'WP2' });
    expect(nextTarget({ waypoints, nextIndex: 1, skipped: ['WP1', 'WP2'] })).toEqual({ kind: 'complete', index: 3 });
    expect(nextTarget({ waypoints, nextIndex: 1, shelter: HAB_SHELTER })).toEqual({ kind: 'shelter', index: null, name: HAB_SHELTER.name, x: 535.1, z: 574.1 });
  });
});

describe('waypoint runner', () => {
  it('writes distance and bearing to the next waypoint and registers their source', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    const runner = start(store);
    expect(store.getState().navigation.waypointRangeM).toBeCloseTo(50, 6);
    expect(store.getState().navigation.waypointBearingDeg).toBeCloseTo(143.13, 1);
    expect(store.getState().sources).toEqual(WAYPOINT_SOURCES);
    runner.stop();
  });

  it('advances a non-science waypoint inside 5 m and records it visited once', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    moveTo(store, 25, 40);
    const runner = start(store);
    runner.tick();
    runner.tick();
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toEqual(['WP1 · channel floor']);
    runner.stop();
  });

  it('requires the 2 m radius of stops.json at a science stop', () => {
    const store = memoryStore();
    store.getState().route.waypoints[1] = { name: 'Cheyava Falls', x: 0, z: 10 };
    store.getState().route.waypoints[2] = { name: 'WP4', x: 0, z: 100 };
    store.getState().route.nextIndex = 1;
    moveTo(store, 0, 7.9);
    const runner = start(store);
    expect(store.getState().route.nextIndex).toBe(1);

    moveTo(store, 0, 8.1);
    runner.tick();
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toEqual(['Cheyava Falls']);
    // the range written on the arrival tick belongs to the new target, not the stop just reached
    expect(store.getState().navigation.waypointRangeM).toBeCloseTo(91.9, 6);
    runner.stop();
  });

  it('writes null range and bearing after the last waypoint', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    moveTo(store, 30, 38);
    const runner = start(store);
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toEqual(['WP1 · channel floor']);
    expect(store.getState().navigation.waypointRangeM).toBeNull();
    expect(store.getState().navigation.waypointBearingDeg).toBeNull();

    runner.tick();
    expect(store.getState().route.nextIndex).toBe(2);
    expect(store.getState().route.visited).toEqual(['WP1 · channel floor']);
    runner.stop();
  });

  it('starts over after a re-plan resets the route', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 2;
    store.getState().route.visited = ['HAB', 'WP1 · channel floor'];
    const runner = start(store);
    expect(store.getState().navigation.waypointRangeM).toBeNull();

    store.setState((s) => ({ route: { ...s.route, waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP9', x: 0, z: -20 }], nextIndex: 0, visited: [] } }));
    runner.tick();
    expect(store.getState().route.visited).toEqual(['HAB']);
    expect(store.getState().route.nextIndex).toBe(1);
    expect(store.getState().navigation.waypointRangeM).toBeCloseTo(20, 6);
    expect(store.getState().navigation.waypointBearingDeg).toBeCloseTo(0, 6);
    runner.stop();
  });

  it('targets the shelter and leaves out skipped stops during an event', () => {
    const store = memoryStore();
    store.getState().route.waypoints = [
      { name: 'HAB', x: 520, z: 600 },
      { name: 'WP1 · channel floor', x: 30, z: 40 },
      { name: 'WP2 · dune field edge', x: 31, z: 40 },
      { name: 'Cheyava Falls', x: 0, z: 0 },
    ];
    store.getState().route.nextIndex = 1;
    store.getState().route.skipped = ['WP1 · channel floor', 'WP2 · dune field edge', 'Cheyava Falls'];
    store.getState().route.shelter = HAB_SHELTER;
    moveTo(store, 30, 40);   // standing on WP1: a skipped stop does not count as reached
    const runner = start(store);
    expect(store.getState().route.visited).toEqual([]);
    expect(store.getState().route.nextIndex).toBe(1);
    expect(store.getState().navigation.waypointRangeM).toBeCloseTo(Math.hypot(505.1, 534.1), 6);

    // the event ends: no shelter, every stop left is skipped, so the route is complete
    store.setState((s) => ({ route: { ...s.route, shelter: null } }));
    runner.tick();
    expect(store.getState().route.visited).toEqual([]);
    expect(store.getState().navigation.waypointRangeM).toBeNull();
    runner.stop();
  });

  it('writes nothing when the position and the target have not changed', () => {
    const store = memoryStore();
    store.getState().route.nextIndex = 1;
    const runner = start(store);
    const writes = store.writes();
    runner.tick();
    runner.tick();
    expect(store.writes()).toBe(writes);
    moveTo(store, 1, 0);
    runner.tick();
    expect(store.writes()).toBe(writes + 1);
    runner.stop();
  });

  it('does not advance in Plan mode or without a waypoint', () => {
    const plan = memoryStore({ mode: 'plan' });
    plan.getState().route.nextIndex = 1;
    const planRunner = start(plan);
    planRunner.tick();
    expect(plan.getState().route.nextIndex).toBe(1);
    expect(plan.getState().route.visited).toEqual([]);
    planRunner.stop();

    const empty = memoryStore();
    empty.getState().route.waypoints = [];
    const emptyRunner = start(empty);
    emptyRunner.tick();
    expect(empty.getState().route.nextIndex).toBe(0);
    expect(empty.getState().navigation.waypointRangeM).toBeNull();
    emptyRunner.stop();
  });
});
