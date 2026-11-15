import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_BYTES, MAX_ROUTE_POINTS, PROTOCOL_VERSION, utf8ByteLength } from '../../src/net/protocol.js';
import { Room } from '../room.js';
import { FakeSocket, createFakeCtx, createFakeStorage } from './fakeCtx.js';

const T0 = 1_800_000_000_000;
let storage, ctx, room;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  storage = createFakeStorage();
  ctx = createFakeCtx({ storage });
  room = new Room(ctx, {});
});
afterEach(() => vi.useRealTimers());

const send = (ws, msg) => room.webSocketMessage(ws, typeof msg === 'string' ? msg : JSON.stringify(msg));
function join(id, role = 'surface') {
  const ws = new FakeSocket();
  room.accept(ws, Date.now());
  send(ws, { type: 'hello', v: PROTOCOL_VERSION, id, name: 'Crew ' + id, role });
  return ws;
}
/** A new Room object over the same storage: what a wake from hibernation or a restart of the object sees. */
function wake() {
  ctx = createFakeCtx({ storage, sockets: ctx.sockets });
  room = new Room(ctx, {});
}
const meta = (k) => storage.db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v ?? null;
/** The largest route the map can produce: 200 points at the far corner of the tile, in decimetres, all negative. */
const widestRoute = (n) => Array.from({ length: n }, (_, i) => [-7112 + (i % 2), -7500 + (i % 3)]);

describe('rt', () => {
  it('a habitat seat sends a route: stored in meta and broadcast to everyone with by and at', () => {
    const a = join('a'), b = join('b'), h = join('h', 'habitat');
    send(h, { type: 'rt', pts: [[5351, 5741], [100, -200], [0, 0]] });
    const out = { type: 'rt', pts: [[5351, 5741], [100, -200], [0, 0]], by: 'h', at: T0 };
    for (const ws of [a, b, h]) expect(ws.last('rt')).toEqual(out);
    expect(JSON.parse(meta('route'))).toEqual({ pts: out.pts, by: 'h', at: T0 });
  });

  it('a surface player cannot send a route', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(a, { type: 'rt', pts: [[0, 0], [10, 10]] });
    expect(h.messages('rt')).toHaveLength(0);
    expect(meta('route')).toBeNull();
  });

  it('refuses a route with non-integer or non-finite points, or fewer than two', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(h, { type: 'rt', pts: [[0, 0], [1.5, 2]] });
    send(h, '{"type":"rt","pts":[[0,0],[1e400,2]]}');
    send(h, { type: 'rt', pts: [[0, 0]] });
    expect(a.messages('rt')).toHaveLength(0);
    expect(meta('route')).toBeNull();
  });

  it('a new route replaces the last one', () => {
    const h = join('h', 'habitat');
    send(h, { type: 'rt', pts: [[0, 0], [10, 10]] });
    vi.setSystemTime(T0 + 1000);
    send(h, { type: 'rt', pts: [[1, 1], [20, 20]] });
    expect(JSON.parse(meta('route'))).toEqual({ pts: [[1, 1], [20, 20]], by: 'h', at: T0 + 1000 });
  });

  it('is in the welcome of a player who joins later, also after a new Room object over the same storage', () => {
    const h = join('h', 'habitat');
    send(h, { type: 'rt', pts: [[5351, 5741], [100, -200]] });
    wake();
    const late = join('late');
    expect(late.last('welcome').route).toEqual({ pts: [[5351, 5741], [100, -200]], by: 'h', at: T0 });
  });

  it('welcome.route is null before any route', () => {
    expect(join('a').last('welcome').route).toBeNull();
  });

  it(`${MAX_ROUTE_POINTS} points fit under the ${MAX_MESSAGE_BYTES} B cap; ${MAX_ROUTE_POINTS + 1} are refused without closing the socket`, () => {
    const a = join('a'), h = join('h', 'habitat');
    const text = JSON.stringify({ type: 'rt', pts: widestRoute(MAX_ROUTE_POINTS) });
    expect(utf8ByteLength(text)).toBeLessThan(MAX_MESSAGE_BYTES);
    send(h, text);
    expect(h.closed).toBeNull();
    expect(a.last('rt').pts).toHaveLength(MAX_ROUTE_POINTS);
    // the broadcast adds by and at, and is still under the cap
    expect(utf8ByteLength(a.sent.at(-1))).toBeLessThan(MAX_MESSAGE_BYTES);

    vi.setSystemTime(T0 + 1000);
    send(h, { type: 'rt', pts: widestRoute(MAX_ROUTE_POINTS + 1) });
    expect(h.closed).toBeNull();
    expect(a.messages('rt')).toHaveLength(1);
    expect(JSON.parse(meta('route')).at).toBe(T0);
  });

  it('a route over 4 KB closes the socket with 1009 before the handler runs', () => {
    const h = join('h', 'habitat');
    const pts = Array.from({ length: 200 }, () => [-1000000, -1000000.5]);
    const text = JSON.stringify({ type: 'rt', pts });
    expect(utf8ByteLength(text)).toBeGreaterThan(MAX_MESSAGE_BYTES);
    send(h, text);
    expect(h.closed?.code).toBe(1009);
    expect(meta('route')).toBeNull();
  });
});

describe('go', () => {
  it('a habitat seat calls no-go with a reason: stored and broadcast to everyone', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(h, { type: 'go', go: false, why: 'Dust rising in the west' });
    const out = { type: 'go', go: false, why: 'Dust rising in the west', by: 'h', at: T0 };
    expect(a.last('go')).toEqual(out);
    expect(h.last('go')).toEqual(out);
    expect(JSON.parse(meta('go_call'))).toEqual({ go: false, why: 'Dust rising in the west', by: 'h', at: T0 });
  });

  it('the reason is optional and a surface player cannot call', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(a, { type: 'go', go: false, why: 'mutiny' });
    expect(h.messages('go')).toHaveLength(0);
    send(h, { type: 'go', go: true });
    expect(a.last('go')).toEqual({ type: 'go', go: true, why: '', by: 'h', at: T0 });
  });

  it('refuses a reason over 80 characters', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(h, { type: 'go', go: true, why: 'x'.repeat(81) });
    expect(a.messages('go')).toHaveLength(0);
  });

  it('the last call is in the welcome after a new Room object', () => {
    const h = join('h', 'habitat');
    send(h, { type: 'go', go: true, why: 'first' });
    vi.setSystemTime(T0 + 500);
    send(h, { type: 'go', go: false, why: 'second' });
    wake();
    expect(join('late').last('welcome').go).toEqual({ go: false, why: 'second', by: 'h', at: T0 + 500 });
    expect(join('later').last('welcome').route).toBeNull();
  });
});

describe('habitat markers', () => {
  it('note and go markers from the habitat use mk and reach the surface', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(h, { type: 'mk', cid: 'h-1', kind: 'note', x: 10, z: 20, label: 'Look at this ridge' });
    expect(a.last('mk')).toMatchObject({ kind: 'note', author: 'h', label: 'Look at this ridge' });
  });
});
