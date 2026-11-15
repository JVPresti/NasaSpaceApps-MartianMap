import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { addHabitatNote, sendGoCall, sendHabitatRoute } from '../state/habitatHooks.js';
import { HABITAT_END_NAME } from '../state/habitatRoute.js';
import { createInitialState } from '../state/store.js';

/** resetStore() for a test store: the initial state with the settings kept, replacing the whole state. */
const resetStore = (store) => store.setState((s) => ({ ...createInitialState(), settings: s.settings }), true);
import { CREW_MS, GO_NOTICE_MS, HABITAT_OFFLINE, ROUTE_NOTICE_MS, crewView, routeToDecimetres, routeToMetres } from './habitat.js';
import { resetIdentityMemory } from './identity.js';
import { startOnline } from './index.js';
import { MAX_MESSAGE_BYTES, MAX_ROUTE_POINTS, utf8ByteLength } from './protocol.js';
import { createSocketFactory, welcomeFor } from './testSocket.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A planner-like path: 3000 points along a winding line across the tile, in metres. */
const longPath = () => Array.from({ length: 3000 }, (_, i) => [-700 + i * 0.45 + Math.sin(i / 40) * 12, 690 - i * 0.46 + Math.cos(i / 25) * 9]);

describe('routeToDecimetres', () => {
  it('a 3000-point planner path fits in 200 integer decimetre points, keeps both ends and stays close to the path', () => {
    const path = longPath();
    const pts = routeToDecimetres(path);
    expect(pts.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);
    expect(pts.length).toBeGreaterThan(50);
    expect(pts.every(([x, z]) => Number.isInteger(x) && Number.isInteger(z))).toBe(true);
    expect(pts[0]).toEqual([Math.round(path[0][0] * 10), Math.round(path[0][1] * 10)]);
    expect(pts.at(-1)).toEqual([Math.round(path.at(-1)[0] * 10), Math.round(path.at(-1)[1] * 10)]);
    // every original point lies within a few metres of the simplified line
    const back = routeToMetres(pts);
    const off = (p) => Math.min(...back.slice(1).map((b, i) => {
      const a = back[i], dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
    }));
    expect(Math.max(...path.filter((_, i) => i % 50 === 0).map(off))).toBeLessThan(3);
    expect(utf8ByteLength(JSON.stringify({ type: 'rt', pts }))).toBeLessThan(MAX_MESSAGE_BYTES);
  });

  it('a short path is only rounded; repeated points and bad input are dropped', () => {
    expect(routeToDecimetres([[1.04, 2.06], [1.01, 2.09], [5, -3.33]])).toEqual([[10, 21], [50, -33]]);
    expect(routeToDecimetres([[1, 1]])).toBeNull();
    expect(routeToDecimetres(null)).toBeNull();
    expect(routeToDecimetres([[1, 1], [NaN, 2], [1, 1]])).toBeNull();
  });
});

describe('crewView: the habitat map and radio line of sight', () => {
  const players = [{ id: 'a', name: 'Ana', color: 0 }];
  const mast = { x: 0, y: 10, z: 0 };
  // a ridge along x = 100: anything east of it is hidden from the mast
  const lineOfSight = (p) => ({ clear: p.x < 100 });
  const tel = () => ({ oxygenPct: 81, batteryPct: 77 });

  it('in sight: the estimated position (ex, ez) and the telemetry, with the range from the true position', () => {
    const heard = new Map();
    const [c] = crewView({ players, sample: () => ({ x: 30, z: 40, ex: 32, ez: 41 }), telemetry: tel, mast, lineOfSight, heard, nowMs: 1000 });
    expect(c).toMatchObject({ id: 'a', x: 32, z: 41, link: true, lastKnown: false, heardAtMs: 1000, rangeM: 50, oxygenPct: 81, batteryPct: 77 });
  });

  it('behind a ridge: the last position and suit values heard, flagged last known', () => {
    const heard = new Map();
    crewView({ players, sample: () => ({ x: 90, z: 0, ex: 91, ez: 0 }), telemetry: tel, mast, lineOfSight, heard, nowMs: 1000 });
    const [c] = crewView({ players, sample: () => ({ x: 140, z: 5, ex: 141, ez: 5 }), telemetry: () => ({ oxygenPct: 60, batteryPct: 50 }), mast, lineOfSight, heard, nowMs: 9000 });
    expect(c).toMatchObject({ x: 91, z: 0, link: false, lastKnown: true, heardAtMs: 1000, oxygenPct: 81, batteryPct: 77 });
  });

  it('back in sight: live again', () => {
    const heard = new Map();
    crewView({ players, sample: () => ({ x: 140, z: 0 }), telemetry: tel, mast, lineOfSight, heard, nowMs: 1000 });
    expect(heard.size).toBe(0);   // never heard: nothing on the map
    const [c] = crewView({ players, sample: () => ({ x: 50, z: 0 }), telemetry: tel, mast, lineOfSight, heard, nowMs: 2000 });
    expect(c).toMatchObject({ x: 50, z: 0, link: true, lastKnown: false });
  });

  it('never heard from (no pose, or only behind the ridge): left out', () => {
    expect(crewView({ players, sample: () => null, telemetry: tel, mast, lineOfSight, heard: new Map(), nowMs: 1 })).toEqual([]);
    expect(crewView({ players, sample: () => ({ x: 200, z: 0 }), telemetry: tel, mast, lineOfSight, heard: new Map(), nowMs: 1 })).toEqual([]);
  });
});

describe('the habitat slice through startOnline', () => {
  let f, store, handle, engine;
  const HAB = { id: 'h1', name: 'Hab', color: null, role: 'habitat', joinedAt: 1 };
  const ANA = { id: 'a1', name: 'Ana', color: 0, role: 'surface', joinedAt: 2 };
  const ws = () => f.last();
  const sent = (type) => ws().json().filter((m) => m.type === type);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('localStorage', memoryStorage());
    resetIdentityMemory();
    f = createSocketFactory();
    store = create(() => createInitialState());
    // a ridge at x = 100 between the mast and the east of the map
    engine = { getHabitatMast: () => ({ x: 0, y: 10, z: 0 }), lineOfSight: (p) => ({ clear: p.x < 100 }) };
  });
  afterEach(() => { handle?.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  function start(role, me) {
    handle = startOnline({ code: 'ABCD', store, role, url: 'ws://test/api/room/ABCD', WebSocketImpl: f.FakeWebSocket, getEngine: () => engine });
    ws().open();
    return (extra = {}) => ws().receive(welcomeFor(me.id, { you: { id: me.id, color: me.color, role }, crew: [HAB, ANA], ...extra }));
  }

  it('defaults match the store', () => {
    expect(createInitialState().habitat).toEqual(HABITAT_OFFLINE);
    expect(createInitialState().route.origin).toBeNull();
  });

  it('the habitat seat sends a route through the hook, decimated, and the echo confirms it', () => {
    start('habitat', HAB)();
    expect(sendHabitatRoute(longPath())).toBeGreaterThan(0);
    const [rt] = sent('rt');
    expect(rt.pts.length).toBeLessThanOrEqual(200);
    expect(store.getState().habitat.sent.route).toBe('pending');
    ws().receive({ type: 'rt', pts: rt.pts, by: 'h1', at: 500 });
    const h = store.getState().habitat;
    expect(h.sent.route).toBe('confirmed');
    expect(h.route).toEqual({ path: routeToMetres(rt.pts), by: 'h1', at: 500 });
    expect(store.getState().route.origin).toBeNull();   // the habitat does not adopt its own route
  });

  it('go and no-go with a reason, confirmed by the echo; notes go out as mk', () => {
    start('habitat', HAB)();
    expect(sendGoCall(false, '  Dust   rising ')).toBe(true);
    expect(sent('go')).toEqual([{ type: 'go', go: false, why: 'Dust rising' }]);
    expect(store.getState().habitat.sent.go).toBe('pending');
    ws().receive({ type: 'go', go: false, why: 'Dust rising', by: 'h1', at: 9 });
    expect(store.getState().habitat).toMatchObject({ go: { go: false, why: 'Dust rising', by: 'h1', at: 9 }, sent: { go: 'confirmed' } });
    expect(addHabitatNote(12.345, -6, 'Check the ridge')).toBeTruthy();
    expect(addHabitatNote(1, 2, '', 'go')).toBeTruthy();
    expect(sent('mk').map((m) => [m.kind, m.x, m.z, m.label])).toEqual([['note', 12.35, -6, 'Check the ridge'], ['go', 1, 2, '']]);
  });

  it('a surface player cannot send a route or a call', () => {
    start('surface', ANA)();
    expect(sendHabitatRoute([[0, 0], [10, 10]])).toBe(0);
    expect(sendGoCall(true)).toBe(false);
    expect(sent('rt')).toHaveLength(0);
    expect(sent('go')).toHaveLength(0);
  });

  it('the habitat seat sends no poses and no tel, and draws no remote suits in its scene', () => {
    const setPartnerSources = vi.fn();
    engine = { ...engine, setPartnerSources, getPlayer: () => ({ x: 1, z: 2, headingDeg: 0, moveSpeed: 1 }) };
    start('habitat', HAB)();
    store.setState((s) => ({ suit: { ...s.suit, oxygenPct: 90, batteryPct: 90 } }));
    vi.advanceTimersByTime(12_000);
    expect(sent('p')).toHaveLength(0);
    expect(sent('tel')).toHaveLength(0);
    expect(setPartnerSources.mock.calls.every(([list]) => list.length === 0)).toBe(true);
  });

  it('writes habitat.crew from the poses: live in sight, grey at the last known position behind the ridge', () => {
    start('habitat', HAB)();
    ws().receive({ type: 'tel', o2: 88, bat: 70, id: 'a1' });
    ws().receive({ type: 'p', x: 50, z: 0, h: 0, pt: 0, a: 'walk', hp: 0, ct: 1000, ex: 51, ez: 1, id: 'a1' });
    vi.advanceTimersByTime(CREW_MS * 2);
    expect(store.getState().habitat.crew).toEqual([expect.objectContaining({ id: 'a1', name: 'Ana', color: 0, x: 51, z: 1, link: true, lastKnown: false, oxygenPct: 88, batteryPct: 70 })]);
    ws().receive({ type: 'p', x: 150, z: 0, h: 0, pt: 0, a: 'walk', hp: 0, ct: 2000, ex: 149, ez: 2, id: 'a1' });
    vi.advanceTimersByTime(1500);
    expect(store.getState().habitat.crew[0]).toMatchObject({ x: 51, z: 1, link: false, lastKnown: true });
  });

  it('a surface player adopts the route with a notice, and keeps their walk on a reconnect with the same route', () => {
    const welcome = start('surface', ANA);
    store.setState((s) => ({ route: { ...s.route, waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1', x: 50, z: 0 }, { name: 'WP2', x: 100, z: 0 }] } }));
    welcome();
    ws().receive({ type: 'rt', pts: [[0, 0], [500, 0], [1000, 0], [1000, 500]], by: 'h1', at: 42 });
    let s = store.getState();
    expect(s.route.path).toEqual([[0, 0], [50, 0], [100, 0], [100, 50]]);
    expect(s.route.origin).toEqual({ kind: 'habitat', by: 'h1', at: 42 });
    expect(s.route.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP1', 'WP2', HABITAT_END_NAME]);
    expect(s.habitat.notice).toMatchObject({ key: 'route', by: 'h1', name: 'Hab' });
    vi.advanceTimersByTime(ROUTE_NOTICE_MS + 1);
    expect(store.getState().habitat.notice).toBeNull();

    // walked to WP1, then the socket drops and comes back: the same route is not adopted again
    store.setState((st) => ({ route: { ...st.route, nextIndex: 2, visited: ['HAB', 'WP1'] } }));
    ws().drop();
    vi.advanceTimersByTime(600);
    ws().open();
    welcome({ route: { pts: [[0, 0], [500, 0], [1000, 0], [1000, 500]], by: 'h1', at: 42 } });
    s = store.getState();
    expect(s.route.nextIndex).toBe(2);
    expect(s.habitat.notice).toBeNull();
  });

  it('a restart that resets the store takes the habitat route again once the waypoints are back', () => {
    const welcome = start('surface', ANA);
    const stops = [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1', x: 100, z: 0 }];
    store.setState((s) => ({ route: { ...s.route, waypoints: stops } }));
    welcome({ route: { pts: [[0, 0], [1000, 0]], by: 'h1', at: 42 } });
    expect(store.getState().route.origin?.at).toBe(42);
    resetStore(store);   // what restartEva does
    expect(store.getState().route.origin).toBeNull();
    store.setState((s) => ({ route: { ...s.route, waypoints: stops, path: [[0, 0], [5, 5], [100, 0]] } }));   // route.json and the table's planner
    const s = store.getState();
    expect(s.route.origin).toEqual({ kind: 'habitat', by: 'h1', at: 42 });
    expect(s.route.path).toEqual([[0, 0], [100, 0]]);
    expect(s.habitat.notice?.key).toBe('route');
  });

  it('after a reload the route comes from the welcome once the table has loaded the waypoints', () => {
    const welcome = start('surface', ANA);
    welcome({ route: { pts: [[0, 0], [1000, 0]], by: 'h1', at: 42 } });
    expect(store.getState().habitat.route.at).toBe(42);
    expect(store.getState().route.origin).toBeNull();   // no waypoints yet: route.json is still loading
    store.setState((s) => ({ route: { ...s.route, waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1', x: 100, z: 0 }] } }));
    const s = store.getState();
    expect(s.route.origin).toEqual({ kind: 'habitat', by: 'h1', at: 42 });
    expect(s.route.path).toEqual([[0, 0], [100, 0]]);
    expect(s.finds.routeKey).toBeTruthy();   // the mission table's planner leaves this route alone
    expect(s.habitat.notice?.key).toBe('route');
  });

  it('a go or no-go call shows as a visor notice once; the welcome rebuilds the last call', () => {
    const welcome = start('surface', ANA);
    welcome({ go: { go: false, why: 'Dust rising', by: 'h1', at: 7 } });
    expect(store.getState().habitat.go).toEqual({ go: false, why: 'Dust rising', by: 'h1', at: 7 });
    expect(store.getState().habitat.notice).toMatchObject({ key: 'no-go', name: 'Hab' });
    vi.advanceTimersByTime(GO_NOTICE_MS + 1);
    expect(store.getState().habitat.notice).toBeNull();
    ws().receive({ type: 'go', go: true, why: '', by: 'h1', at: 8 });
    expect(store.getState().habitat.notice).toMatchObject({ key: 'go' });
  });

  it('every welcome rebuilds route and go, null included', () => {
    const welcome = start('habitat', HAB);
    welcome({ route: { pts: [[0, 0], [10, 10]], by: 'h1', at: 1 }, go: { go: true, why: '', by: 'h1', at: 2 } });
    expect(store.getState().habitat).toMatchObject({ route: { at: 1 }, go: { at: 2 } });
    ws().drop();
    vi.advanceTimersByTime(600);
    ws().open();
    welcome();
    expect(store.getState().habitat).toMatchObject({ route: null, go: null });
  });

  it('stop puts the offline slice back and empties the hooks', () => {
    start('habitat', HAB)();
    handle.stop();
    handle = null;
    expect(store.getState().habitat).toEqual(HABITAT_OFFLINE);
    expect(sendHabitatRoute([[0, 0], [1, 1]])).toBe(0);
    expect(sendGoCall(true)).toBe(false);
    expect(addHabitatNote(0, 0)).toBeNull();
  });
});
