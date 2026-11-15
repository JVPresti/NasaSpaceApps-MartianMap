import { describe, expect, it } from 'vitest';
import {
  OFF_ROUTE_DEFAULTS,
  createOffRouteMonitor,
  distanceToPath,
  startOffRouteRunner,
} from './offRoute.js';

const PATH = [[0, 0], [100, 0]];

describe('distance to a route', () => {
  it('is zero on the line and the perpendicular distance beside it', () => {
    expect(distanceToPath({ x: 50, z: 0 }, PATH)).toBeCloseTo(0, 6);
    expect(distanceToPath({ x: 50, z: 30 }, PATH)).toBeCloseTo(30, 6);
  });

  it('measures to the nearest endpoint outside the segment', () => {
    expect(distanceToPath({ x: -10, z: 0 }, PATH)).toBeCloseTo(10, 6);
    expect(distanceToPath({ x: 110, z: 0 }, PATH)).toBeCloseTo(10, 6);
  });

  it('returns Infinity without a usable path', () => {
    expect(distanceToPath({ x: 0, z: 0 }, null)).toBe(Infinity);
    expect(distanceToPath({ x: 0, z: 0 }, [[0, 0]])).toBe(Infinity);
  });
});

describe('off-route monitor', () => {
  it('uses the issue defaults', () => {
    expect(OFF_ROUTE_DEFAULTS).toEqual({
      thresholdM: 20,
      holdSec: 5,
      cooldownSec: 10,
      minMoveM: 2,
    });
  });

  it('triggers after 5 s off the route while moving', () => {
    const monitor = createOffRouteMonitor();
    let decision;
    for (let second = 0; second <= 5; second += 1) {
      decision = monitor.update({
        point: { x: 50, z: 30 + second },
        path: PATH,
        missionTimeSec: second,
        canReplan: true,
      });
      expect(decision.trigger).toBe(second === 5);
    }
    expect(decision.reason).toMatch(/Off route/);
    expect(decision.offRouteM).toBeCloseTo(35, 6);
  });

  it('does not trigger when standing still off the route', () => {
    const monitor = createOffRouteMonitor();
    for (let second = 0; second <= 20; second += 1) {
      expect(monitor.update({
        point: { x: 50, z: 30 },
        path: PATH,
        missionTimeSec: second,
        canReplan: true,
      }).trigger).toBe(false);
    }
  });

  it('does not trigger while walking along the route', () => {
    const monitor = createOffRouteMonitor();
    for (let second = 0; second <= 20; second += 1) {
      expect(monitor.update({
        point: { x: second * 2, z: 0 },
        path: PATH,
        missionTimeSec: second,
        canReplan: true,
      }).trigger).toBe(false);
    }
  });

  it('resets when the crew comes back to the route', () => {
    const monitor = createOffRouteMonitor();
    monitor.update({ point: { x: 50, z: 30 }, path: PATH, missionTimeSec: 0, canReplan: true });
    monitor.update({ point: { x: 50, z: 31 }, path: PATH, missionTimeSec: 1, canReplan: true });
    monitor.update({ point: { x: 50, z: 0 }, path: PATH, missionTimeSec: 2, canReplan: true });
    const after = monitor.update({ point: { x: 50, z: 2 }, path: PATH, missionTimeSec: 3, canReplan: true });
    expect(after.offForSec).toBe(0);
  });

  it('waits for the cooldown after a re-plan', () => {
    const monitor = createOffRouteMonitor();
    let triggers = 0;
    for (let second = 0; second <= 15; second += 1) {
      const decision = monitor.update({
        point: { x: 50, z: 30 + second },
        path: PATH,
        missionTimeSec: second,
        canReplan: true,
      });
      if (decision.trigger) triggers += 1;
      // A trigger at 5 s, then the next one only after the 10 s cooldown.
      if (second < 5) expect(decision.trigger).toBe(false);
      if (second > 5 && second < 15) expect(decision.trigger).toBe(false);
    }
    expect(triggers).toBe(2);
  });

  it('never replaces an event route', () => {
    const monitor = createOffRouteMonitor();
    for (let second = 0; second <= 10; second += 1) {
      const decision = monitor.update({
        point: { x: 50, z: 30 + second },
        path: PATH,
        missionTimeSec: second,
        canReplan: true,
        eventActive: true,
      });
      expect(decision.trigger).toBe(false);
      expect(decision.reason).toBe('event-route');
    }
  });

  it('does nothing without a remaining waypoint', () => {
    const monitor = createOffRouteMonitor();
    expect(monitor.update({
      point: { x: 50, z: 30 },
      path: PATH,
      missionTimeSec: 10,
      canReplan: false,
    }).trigger).toBe(false);
  });
});

function memoryStore(overrides = {}) {
  let state = {
    mode: 'walk',
    mission: { elapsedSec: 0 },
    navigation: { x: 0, z: 30 },
    alerts: {},
    route: {
      path: PATH,
      waypoints: [
        { name: 'HAB', x: 0, z: 0 },
        { name: 'WP1', x: 30, z: 0 },
        { name: 'WP2', x: 60, z: 0 },
        { name: 'WP3', x: 90, z: 0 },
        { name: 'Cheyava', x: 100, z: 0 },
      ],
      nextIndex: 2,
      distanceM: 100,
      climbM: 0,
      steepestSlopeDeg: 0,
      etaSec: 100,
      reason: 'Planned route',
      decision: 'go',
      skipped: [],
    },
    sources: {},
    ...overrides,
  };
  return {
    getState: () => state,
    setState: (updater) => { state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }; },
  };
}

function planResult() {
  return {
    ok: true,
    path: [[50, 35], [60, 31], [90, 31], [100, 31]],
    distance: 55,
    climb: 1,
    steepestSlopeDeg: 3,
    cost: 70,
  };
}

describe('off-route runner', () => {
  it('plans from the player to the remaining waypoints and writes the route', async () => {
    const store = memoryStore();
    const calls = [];
    const runner = startOffRouteRunner({
      store,
      plan: async (waypoints, options) => {
        calls.push({ waypoints, options });
        return planResult();
      },
      setInterval: () => 1,
      clearInterval: () => {},
    });

    for (let second = 0; second <= 5; second += 1) {
      store.getState().mission.elapsedSec = second;
      store.getState().navigation = { x: 50, z: 30 + second };
      await runner.tick();
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].waypoints.map((waypoint) => waypoint.name)).toEqual(['WP2', 'WP3', 'Cheyava']);
    expect(calls[0].options.start).toEqual({ x: 50, z: 35 });
    expect(store.getState().route.reason).toBe('Off route: new route from your position');
    expect(store.getState().route.path[0]).toEqual([50, 35]);
    expect(store.getState().route.decision).toBe('pending');
    runner.stop();
  });

  it('leads to the shelter while the route home is set, and never to a skipped stop (D12)', async () => {
    const home = memoryStore({ route: { ...memoryStore().getState().route, shelter: { id: 'HAB', name: 'Habitat', x: 0, z: 0 }, skipped: ['WP2', 'WP3', 'Cheyava'] } });
    const skipped = memoryStore({ route: { ...memoryStore().getState().route, skipped: ['WP2'] } });
    for (const [store, expected] of [[home, ['Habitat']], [skipped, ['WP3', 'Cheyava']]]) {
      const calls = [];
      const runner = startOffRouteRunner({
        store,
        plan: async (waypoints) => { calls.push(waypoints.map((waypoint) => waypoint.name)); return planResult(); },
        setInterval: () => 1,
        clearInterval: () => {},
      });
      for (let second = 0; second <= 5; second += 1) {
        store.getState().mission.elapsedSec = second;
        store.getState().navigation = { x: 50, z: 30 + second };
        await runner.tick();
      }
      expect(calls).toEqual([expected]);
      expect(store.getState().route.skipped).toEqual(store === home ? ['WP2', 'WP3', 'Cheyava'] : ['WP2']);
      runner.stop();
    }
  });

  it('does not replace an event route', async () => {
    const store = memoryStore({ alerts: { 'dust-storm': { active: true } } });
    let calls = 0;
    const runner = startOffRouteRunner({
      store,
      plan: async () => { calls += 1; return planResult(); },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    for (let second = 0; second <= 10; second += 1) {
      store.getState().mission.elapsedSec = second;
      store.getState().navigation = { x: 50, z: 30 + second };
      await runner.tick();
    }
    expect(calls).toBe(0);
    runner.stop();
  });

  it('only runs in Walk mode', async () => {
    const store = memoryStore({ mode: 'plan' });
    let calls = 0;
    const runner = startOffRouteRunner({
      store,
      plan: async () => { calls += 1; return planResult(); },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    for (let second = 0; second <= 10; second += 1) {
      store.getState().mission.elapsedSec = second;
      store.getState().navigation = { x: 50, z: 30 + second };
      await runner.tick();
    }
    expect(calls).toBe(0);
    runner.stop();
  });

  it('does not plan twice while one request is in flight', async () => {
    const store = memoryStore();
    let calls = 0;
    let resolvePlan;
    const pending = new Promise((resolve) => { resolvePlan = resolve; });
    const runner = startOffRouteRunner({
      store,
      plan: () => { calls += 1; return pending; },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    for (let second = 0; second <= 4; second += 1) {
      store.getState().mission.elapsedSec = second;
      store.getState().navigation = { x: 50, z: 30 + second };
      await runner.tick();
    }
    store.getState().mission.elapsedSec = 5;
    store.getState().navigation = { x: 50, z: 35 };
    const trigger = runner.tick();
    await Promise.resolve();
    expect(calls).toBe(1);
    await runner.tick();
    expect(calls).toBe(1);
    resolvePlan(planResult());
    await trigger;
    runner.stop();
  });
});
