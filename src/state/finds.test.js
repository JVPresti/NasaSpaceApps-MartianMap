import { describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { MAX_FINDS } from '../sim/findDetour.js';
import { waypointKey } from '../plan/routePlan.js';
import { acceptFind, dismissFind, markFind, priceFind, pruneFinds } from './finds.js';
import { createInitialState } from './store.js';

const WAYPOINTS = [{ name: 'HAB', x: 520, z: 600 }, { name: 'WP1', x: 330, z: 300 }, { name: 'WP2', x: 150, z: 120 }];

function makeStore() {
  const store = create(() => createInitialState());
  store.setState((s) => ({
    navigation: { ...s.navigation, x: 400, z: 400 },
    route: { ...s.route, waypoints: WAYPOINTS, nextIndex: 1, path: [[520, 600], [330, 300], [150, 120]] },
    suit: { ...s.suit, oxygenG: 700, oxygenSec: 40000, marginSec: 41 * 60 },
  }));
  return store;
}

const priced = (insertIndex, extra = {}) => ({
  ok: true, blocked: false, insertIndex, extraSec: 360, extraO2G: 20, extraM: 300,
  marginBeforeSec: 2460, marginAfterSec: 2100, marginStatus: 'nominal', verdict: 'go', reason: null, path: [], ...extra,
});

const planned = (waypoints) => ({
  ok: true,
  path: waypoints.map((w) => [w.x, w.z]),
  distance: 900, climb: 10, steepestSlopeDeg: 8,
});

describe('marking a find', () => {
  it('drops M01 and makes it the card the HUD shows', () => {
    const store = makeStore();
    const r = markFind({ x: 250.123, z: 210 }, { store });
    expect(r.ok).toBe(true);
    const { finds } = store.getState();
    expect(finds.list).toHaveLength(1);
    expect(finds.list[0]).toMatchObject({ label: 'M01', x: 250.12, z: 210, status: 'pricing' });
    expect(finds.activeId).toBe(r.find.id);
  });

  it('waits for a decision before a second find, and stops at the limit', () => {
    const store = makeStore();
    markFind({ x: 1, z: 1 }, { store });
    expect(markFind({ x: 2, z: 2 }, { store })).toMatchObject({ ok: false, reason: 'undecided', label: 'M01' });
    store.setState((s) => ({ finds: { ...s.finds, list: s.finds.list.map((f) => ({ ...f, status: 'accepted' })) } }));
    for (let i = 1; i < MAX_FINDS; i += 1) {
      const r = markFind({ x: i, z: i }, { store });
      expect(r.ok).toBe(true);
      store.setState((s) => ({ finds: { ...s.finds, list: s.finds.list.map((f) => ({ ...f, status: 'accepted' })) } }));
    }
    expect(markFind({ x: 9, z: 9 }, { store })).toMatchObject({ ok: false, reason: 'limit' });
  });
});

describe('pricing', () => {
  it('sends the position, the remaining route and the suit numbers to the planner', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    const detour = vi.fn(async () => priced(2));
    await priceFind(find.id, { store, detour, constants: { k: 1 }, sources: { 'finds.extraSec': { tag: 'SIM', source: 'x' } } });
    expect(detour).toHaveBeenCalledWith(expect.objectContaining({
      position: { x: 400, z: 400 }, nextIndex: 1, find: { x: 250, z: 210 }, constants: { k: 1 },
      suit: { oxygenG: 700, oxygenSec: 40000, marginSec: 2460 },
    }));
    const f = store.getState().finds.list[0];
    expect(f.status).toBe('priced');
    expect(f.detour.insertIndex).toBe(2);
    expect(store.getState().sources['finds.extraSec'].tag).toBe('SIM');
  });
});

describe('accepting', () => {
  it('inserts the waypoint after the current target and re-plans the whole route', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    await priceFind(find.id, { store, detour: async () => priced(2), constants: {} });
    const plan = vi.fn(async (waypoints, options) => planned(waypoints, options));
    expect(await acceptFind(find.id, { store, plan })).toBe(true);

    const { route, finds } = store.getState();
    expect(route.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP1', 'M01 · find', 'WP2']);
    expect(route.nextIndex).toBe(1);   // still walking to WP1
    expect(plan).toHaveBeenCalledWith(route.waypoints, { smooth: true });
    expect(route.path[0]).toEqual([520, 600]);   // from the habitat, so the walkback and the legs stay right
    expect(route.reason).toBe('Find M01 added: +6 min');
    expect(route.decision).toBe('pending');
    expect(finds.list[0].status).toBe('accepted');
    expect(finds.activeId).toBeNull();
    expect(finds.routeKey).toBe(waypointKey(route.waypoints));
  });

  it('can add a no-go find: the map advises, the crew decides', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    await priceFind(find.id, { store, detour: async () => priced(1, { verdict: 'no-go', reason: 'margin' }), constants: {} });
    expect(await acceptFind(find.id, { store, plan: async (w, o) => planned(w, o) })).toBe(true);
    expect(store.getState().route.waypoints[1].name).toBe('M01 · find');
  });

  it('refuses while an event route is active', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    await priceFind(find.id, { store, detour: async () => priced(2), constants: {} });
    store.setState((s) => ({ route: { ...s.route, shelter: { id: 'HAB', x: 520, z: 600 } } }));
    const plan = vi.fn();
    expect(await acceptFind(find.id, { store, plan })).toBe(false);
    expect(plan).not.toHaveBeenCalled();
    expect(store.getState().finds.list[0].error).toMatch(/event route/);
  });

  it('prices again when the route moved on since the card opened', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    await priceFind(find.id, { store, detour: async () => priced(1), constants: {} });
    store.setState((s) => ({ route: { ...s.route, nextIndex: 2 } }));
    const reprice = vi.fn((id) => priceFind(id, { store, detour: async () => priced(2), constants: {} }));
    expect(await acceptFind(find.id, { store, plan: async (w, o) => planned(w, o), reprice })).toBe(true);
    expect(reprice).toHaveBeenCalledTimes(1);
    expect(store.getState().route.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP1', 'M01 · find', 'WP2']);
  });
});

describe('dismissing and pruning', () => {
  it('dismiss removes an undecided find and closes its card', () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    expect(dismissFind(find.id, { store })).toBe(true);
    expect(store.getState().finds).toMatchObject({ list: [], activeId: null });
  });

  it('drops an accepted find once its waypoint is reached', async () => {
    const store = makeStore();
    const { find } = markFind({ x: 250, z: 210 }, { store });
    await priceFind(find.id, { store, detour: async () => priced(2), constants: {} });
    await acceptFind(find.id, { store, plan: async (w, o) => planned(w, o) });
    expect(pruneFinds({ store })).toBe(false);
    store.setState((s) => ({ route: { ...s.route, visited: ['HAB', 'WP1', 'M01 · find'] } }));
    expect(pruneFinds({ store })).toBe(true);
    expect(store.getState().finds.list).toEqual([]);
    expect(store.getState().route.waypoints).toHaveLength(4);   // the waypoint stays in the route
  });
});
