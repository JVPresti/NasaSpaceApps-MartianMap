import { describe, expect, it } from 'vitest';
import { applyPlannedRoute } from './routeUpdate.js';

function memoryStore() {
  let state = {
    route: { path: [[0, 0], [10, 0]], distanceM: 10, reason: 'old', decision: 'go', skipped: ['WP1'] },
    sources: {},
  };
  return {
    getState: () => state,
    setState: (updater) => {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...patch };
    },
  };
}

const result = {
  ok: true,
  path: [[0, 0], [20, 0]],
  distance: 20,
  climb: 1,
  steepestSlopeDeg: 4,
};

describe('planned route writer', () => {
  it('writes the route, reason and source tags', () => {
    const store = memoryStore();
    expect(applyPlannedRoute(store, result, { reason: 'Detour', etaSec: 20 })).toBe(true);
    expect(store.getState().route.path).toEqual(result.path);
    expect(store.getState().route.reason).toBe('Detour');
    expect(store.getState().route.decision).toBe('pending');
    expect(store.getState().sources['route.path'].tag).toBe('DERIVED');
    expect(store.getState().sources['route.etaSec'].tag).toBe('SIM');
  });

  it('keeps the stops a hazard skipped: only Re-plan at the table brings them back (D12)', () => {
    const store = memoryStore();
    applyPlannedRoute(store, result, { reason: 'Off route: new route from your position' });
    expect(store.getState().route.skipped).toEqual(['WP1']);
  });

  it('keeps the old path on failure and records the reason', () => {
    const store = memoryStore();
    expect(applyPlannedRoute(store, { ok: false, detail: 'no path' }, { reason: 'Detour' })).toBe(false);
    expect(store.getState().route.path).toEqual([[0, 0], [10, 0]]);
    expect(store.getState().route.reason).toBe('no path');
  });
});
