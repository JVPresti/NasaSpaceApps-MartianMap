import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVED_ROUTES,
  ROUTE_LIBRARY_KEY,
  deleteRoute,
  readRouteLibrary,
  recordRouteRun,
  riskLevel,
  routeRisk,
  routeSignature,
  saveRoute,
  writeRouteLibrary,
} from './routeLibrary.js';

const waypoints = [
  { name: 'Airlock', x: 0, z: 0 },
  { name: 'Sample 1', x: 120, z: 40 },
];
const path = [[0, 0], [30, 10], [120, 40]];
const route = { waypoints, path, distanceM: 628.4, climbM: 12.7, steepestSlopeDeg: 16.2 };

const storageWith = (raw) => ({ getItem: () => raw });
const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: vi.fn((key, value) => { data[key] = value; }),
  };
};

describe('route risk', () => {
  it('bands the steepest grade with the planner limits', () => {
    expect(riskLevel(8)).toBe('low');
    expect(riskLevel(14.9)).toBe('low');
    expect(riskLevel(15)).toBe('caution');
    expect(riskLevel(19.9)).toBe('caution');
    expect(riskLevel(20)).toBe('high');
    expect(riskLevel(41)).toBe('high');
  });

  it('returns no level for a route without a finite grade', () => {
    for (const value of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, '20']) {
      expect(riskLevel(value), String(value)).toBeNull();
    }
  });

  it('reads the risk of a planned route from its own metrics', () => {
    expect(routeRisk(route)).toEqual({ maxSlopeDeg: 16.2, climbM: 12.7, level: 'caution' });
    expect(routeRisk(null)).toEqual({ maxSlopeDeg: null, climbM: null, level: null });
  });
});

describe('routeSignature', () => {
  it('is stable for the same waypoints and differs when one moves', () => {
    const signature = routeSignature(route);
    expect(signature).toBe('Airlock@0,0|Sample 1@120,40');
    expect(routeSignature({ waypoints: waypoints.map((w) => ({ ...w })) })).toBe(signature);
    expect(routeSignature({ waypoints: [{ ...waypoints[0] }, { ...waypoints[1], x: 121 }] })).not.toBe(signature);
  });

  it('is null without waypoints', () => {
    for (const value of [null, undefined, {}, { waypoints: [] }, { waypoints: 'x' }]) {
      expect(routeSignature(value), String(value)).toBeNull();
    }
  });
});

describe('saveRoute', () => {
  it('adds a route with an empty record and keeps the newest first', () => {
    const first = saveRoute([], { name: '  Ridge  ', route, nowMs: 1000 });
    expect(first).toHaveLength(1);
    expect(first[0].name).toBe('Ridge');
    expect(first[0].waypoints).toEqual(waypoints);
    expect(first[0].path).toEqual(path);
    expect(first[0].distanceM).toBe(628.4);
    expect(first[0].climbM).toBe(12.7);
    expect(first[0].risk).toEqual({ maxSlopeDeg: 16.2, climbM: 12.7, level: 'caution' });
    expect(first[0].record).toEqual({ attempts: 0, completed: 0, samples: 0, distanceM: 0, doseUgy: null, lastRunAtMs: null });
    expect(first[0].id).toMatch(/^route-/);

    const second = saveRoute(first, { name: 'Valley', route, nowMs: 2000 });
    expect(second.map((entry) => entry.name)).toEqual(['Valley', 'Ridge']);
  });

  it('copies the plan so a later edit of the live route does not touch the saved one', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    waypoints[1].x = 999;
    path[1][0] = 999;
    expect(list[0].waypoints[1].x).toBe(120);
    expect(list[0].path[1]).toEqual([30, 10]);
    waypoints[1].x = 120;
    path[1][0] = 30;
  });

  it('refuses a save without a name, waypoints or a path', () => {
    expect(saveRoute([], { name: '   ', route, nowMs: 1 })).toEqual([]);
    expect(saveRoute([], { name: 'No stops', route: { ...route, waypoints: [] }, nowMs: 1 })).toEqual([]);
    expect(saveRoute([], { name: 'No path', route: { ...route, path: [[0, 0]] }, nowMs: 1 })).toEqual([]);
  });

  it('caps the library at the maximum', () => {
    let list = [];
    for (let i = 0; i < MAX_SAVED_ROUTES + 3; i += 1) list = saveRoute(list, { name: 'Route ' + i, route, nowMs: 1000 + i });
    expect(list).toHaveLength(MAX_SAVED_ROUTES);
    expect(list[0].name).toBe('Route ' + (MAX_SAVED_ROUTES + 2));
  });
});

describe('deleteRoute', () => {
  it('drops the entry and returns a new list', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const next = deleteRoute(list, list[0].id);
    expect(next).toEqual([]);
    expect(list).toHaveLength(1);
  });

  it('returns the same list when the id is not there', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    expect(deleteRoute(list, 'nope')).toBe(list);
    expect(deleteRoute(null, list[0].id)).toBeNull();
  });
});

describe('readRouteLibrary', () => {
  it('reads a saved library back', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const storage = memoryStorage({ [ROUTE_LIBRARY_KEY]: JSON.stringify(list) });
    expect(readRouteLibrary(storage)).toEqual(list);
  });

  it('falls back to an empty library for missing, blocked or corrupt storage', () => {
    expect(readRouteLibrary(null)).toEqual([]);
    expect(readRouteLibrary(memoryStorage())).toEqual([]);
    expect(readRouteLibrary(storageWith('not json'))).toEqual([]);
    expect(readRouteLibrary(storageWith('{"a":1}'))).toEqual([]);
    expect(readRouteLibrary(storageWith('null'))).toEqual([]);
    expect(readRouteLibrary({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
  });

  it('drops a corrupt entry but keeps the sound ones', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const raw = JSON.stringify([...list, { id: 'broken' }, { ...list[0], id: 'no-path', path: [[0, 0]] }, null]);
    expect(readRouteLibrary(storageWith(raw))).toEqual(list);
  });
});

describe('writeRouteLibrary', () => {
  it('writes the JSON list and reports success', () => {
    const storage = memoryStorage();
    expect(writeRouteLibrary([], storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(ROUTE_LIBRARY_KEY, '[]');
  });

  it('reports failure instead of throwing when the storage refuses', () => {
    expect(writeRouteLibrary([], { setItem: () => { throw new Error('full'); } })).toBe(false);
  });
});

describe('recordRouteRun', () => {
  const storeWith = (list, summary, options) => {
    const store = {
      state: { routeLibrary: { list } },
      getState() { return this.state; },
      setState(update) { this.state = { ...this.state, ...(typeof update === 'function' ? update(this.state) : update) }; },
    };
    return { store, summary, options };
  };
  const summary = { sampleCount: 3, distanceM: 540.2, doseUgy: 12.5 };

  it('adds the run to the saved route it departed on', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const { store } = storeWith(list);
    expect(recordRouteRun(store, routeSignature(route), summary, { completed: true, nowMs: 5000 })).toBe(true);
    const record = store.state.routeLibrary.list[0].record;
    expect(record).toEqual({ attempts: 1, completed: 1, samples: 3, distanceM: 540.2, doseUgy: 12.5, lastRunAtMs: 5000 });
  });

  it('accumulates across runs and only counts completions when every waypoint was reached', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const { store } = storeWith(list);
    recordRouteRun(store, routeSignature(route), summary, { completed: false, nowMs: 5000 });
    recordRouteRun(store, routeSignature(route), { sampleCount: 1, distanceM: 100, doseUgy: 3 }, { completed: true, nowMs: 6000 });
    const record = store.state.routeLibrary.list[0].record;
    expect(record.attempts).toBe(2);
    expect(record.completed).toBe(1);
    expect(record.samples).toBe(4);
    expect(record.distanceM).toBeCloseTo(640.2, 5);
    expect(record.doseUgy).toBe(3);
    expect(record.lastRunAtMs).toBe(6000);
  });

  it('does nothing when no saved route matches the departed route', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    const { store } = storeWith(list);
    expect(recordRouteRun(store, routeSignature({ waypoints: [{ name: 'Elsewhere', x: 9, z: 9 }] }), summary)).toBe(false);
    expect(recordRouteRun(store, null, summary)).toBe(false);
    expect(store.state.routeLibrary.list).toBe(list);
  });

  it('does nothing without a library, a summary or a usable store', () => {
    const list = saveRoute([], { name: 'Ridge', route, nowMs: 1000 });
    expect(recordRouteRun(storeWith([]).store, routeSignature(route), summary)).toBe(false);
    expect(recordRouteRun(storeWith(list).store, routeSignature(route), null)).toBe(false);
    expect(recordRouteRun(null, routeSignature(route), summary)).toBe(false);
  });

  it('keeps a record entry without its own risk and record values sound', () => {
    const bare = [{ id: 'route-1', name: 'Bare', waypoints, path, distanceM: null, climbM: null }];
    const { store } = storeWith(bare);
    expect(recordRouteRun(store, routeSignature(route), { sampleCount: 0, distanceM: 0, doseUgy: null }, { nowMs: 10 })).toBe(true);
    expect(store.state.routeLibrary.list[0].record).toEqual({ attempts: 1, completed: 0, samples: 0, distanceM: 0, doseUgy: null, lastRunAtMs: 10 });
  });
});
