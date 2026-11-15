import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, MAX_SOCKETS, PROTOCOL_VERSION, STALE_MS } from '../../src/net/protocol.js';
import { HANDLERS, Room } from '../room.js';
import { FakeSocket, createFakeCtx } from './fakeCtx.js';

const T0 = 1_800_000_000_000;
let ctx, room;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  ctx = createFakeCtx();
  room = new Room(ctx, {});
});
afterEach(() => vi.useRealTimers());

function connect() {
  const ws = new FakeSocket();
  room.accept(ws, Date.now());
  return ws;
}
const send = (ws, msg) => room.webSocketMessage(ws, typeof msg === 'string' ? msg : JSON.stringify(msg));
const hello = (id, extra = {}) => ({ type: 'hello', v: PROTOCOL_VERSION, id, name: 'Crew ' + id, role: 'surface', ...extra });
function join(id, extra) {
  const ws = connect();
  send(ws, hello(id, extra));
  return ws;
}
function clientClose(ws, code = 1000) {
  ws.close(code);
  room.webSocketClose(ws, code, '', true);
  ctx.finishClose(ws);
}

describe('Room setup', () => {
  it('answers ping with pong through the auto-response', () => {
    expect(ctx.autoResponsePair).toMatchObject({ request: 'ping', response: 'pong' });
  });

  it('creates meta, markers and samples on first use', () => {
    room.mission();
    const tables = ctx.storage.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
    expect(tables).toEqual(['markers', 'meta', 'samples']);
    const cols = (t) => ctx.storage.db.prepare('PRAGMA table_info(' + t + ')').all().map((r) => r.name);
    expect(cols('markers')).toEqual(['id', 'client_id', 'author', 'kind', 'x', 'z', 'label', 'at']);
    expect(cols('samples')).toEqual(['sample_id', 'author', 'at']);
  });

  it('accepts through fetch and answers 101 with the client end', async () => {
    const pairs = [];
    vi.stubGlobal('WebSocketPair', class { constructor() { const p = { 0: new FakeSocket(), 1: new FakeSocket() }; pairs.push(p); return p; } });
    vi.stubGlobal('Response', class { constructor(body, init) { this.body = body; Object.assign(this, init); } });
    try {
      const res = await room.fetch({ headers: new Headers({ Upgrade: 'websocket' }) });
      expect(res.status).toBe(101);
      expect(res.webSocket).toBe(pairs[0][0]);
      expect(ctx.sockets).toEqual([pairs[0][1]]);
      expect((await room.fetch({ headers: new Headers() })).status).toBe(426);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('hello, welcome and crew', () => {
  it('welcomes the player with the crew, the mission and the server time', () => {
    const a = join('a');
    const w = a.last('welcome');
    expect(w).toEqual({
      type: 'welcome', you: { id: 'a', color: 0, role: 'surface' },
      crew: [{ id: 'a', name: 'Crew a', color: 0, role: 'surface', joinedAt: T0 }],
      startedAt: null, seed: null, now: T0, markers: [], samples: [], caseHolder: null, route: null, go: null,
    });
  });

  it('tells the others about a join and a leave, once', () => {
    const a = join('a');
    vi.setSystemTime(T0 + 10);
    const b = join('b');
    expect(a.last('crew')).toEqual({ type: 'crew', op: 'join', p: { id: 'b', name: 'Crew b', color: 1, role: 'surface', joinedAt: T0 + 10 } });
    expect(b.last('welcome').crew.map((e) => e.id)).toEqual(['a', 'b']);
    room.webSocketError(b);
    clientClose(b, 1006);
    expect(a.messages('crew').filter((m) => m.op === 'leave')).toEqual([{ type: 'crew', op: 'leave', p: expect.objectContaining({ id: 'b' }) }]);
    expect(room.crew().map((e) => e.id)).toEqual(['a']);
  });

  it('closes a socket that talks before hello with 4003', () => {
    const ws = connect();
    send(ws, { type: 't', c: 1 });
    expect(ws.closed).toEqual({ code: CLOSE.HELLO_FIRST, reason: 'hello first' });
    const bad = connect();
    send(bad, 'not json');
    expect(bad.closed.code).toBe(CLOSE.HELLO_FIRST);
  });

  it('seats 4 surface and 2 habitat players and closes the rest with 4001', () => {
    const surface = ['a', 'b', 'c', 'd'].map((id) => join(id));
    expect(surface.map((ws) => ws.last('welcome').you.color)).toEqual([0, 1, 2, 3]);
    const fifth = join('e');
    expect(fifth.closed).toEqual({ code: CLOSE.ROOM_FULL, reason: 'room full' });
    const habitat = ['h1', 'h2'].map((id) => join(id, { role: 'habitat' }));
    expect(habitat.map((ws) => ws.last('welcome').you)).toEqual([{ id: 'h1', color: null, role: 'habitat' }, { id: 'h2', color: null, role: 'habitat' }]);
    expect(join('h3', { role: 'habitat' }).closed.code).toBe(CLOSE.ROOM_FULL);
    expect(room.crew()).toHaveLength(6);
    expect(surface[0].messages('crew').some((m) => m.p.id === 'e' || m.p.id === 'h3')).toBe(false);
  });

  it('closes sockets past MAX_SOCKETS at once, seated or not', () => {
    for (let i = 0; i < MAX_SOCKETS; i++) connect();
    expect(connect().closed.code).toBe(CLOSE.ROOM_FULL);
  });

  it('gives the preferred colour when it is free and the first free one otherwise', () => {
    join('a', { color: 2 });
    expect(join('b', { color: 2 }).last('welcome').you.color).toBe(0);
    expect(join('c', { color: 3 }).last('welcome').you.color).toBe(3);
    expect(join('d').last('welcome').you.color).toBe(1);
  });

  it('a freed colour is reused', () => {
    join('a');
    const b = join('b');
    clientClose(b);
    expect(join('c').last('welcome').you.color).toBe(1);
  });

  it('replaces an open socket of the same player with 4002, keeping its colour and sending no leave', () => {
    const a = join('a');
    const b1 = join('b');
    const b2 = join('b', { color: 3 });
    expect(b1.closed).toEqual({ code: CLOSE.REPLACED, reason: 'replaced' });
    expect(b2.last('welcome').you.color).toBe(1);
    expect(room.crew().map((e) => e.id)).toEqual(['a', 'b']);
    clientClose(b1, CLOSE.REPLACED);
    expect(a.messages('crew').map((m) => m.op)).toEqual(['join', 'join']);
  });

  it('ignores a second hello on a seated socket', () => {
    const a = join('a');
    send(a, hello('a', { role: 'habitat' }));
    expect(a.messages('welcome')).toHaveLength(1);
    expect(room.crew()[0].role).toBe('surface');
  });

  it('closes a stale socket and announces its leave', () => {
    const a = join('a');
    const b = join('b');
    ctx.ping(a, T0 + 20_000);
    vi.setSystemTime(T0 + STALE_MS + 1000);
    send(a, { type: 't', c: 1 });
    expect(b.closed.code).toBe(CLOSE.GOING_AWAY);
    expect(a.closed).toBeNull();
    expect(a.last('crew')).toMatchObject({ op: 'leave', p: { id: 'b' } });
    room.webSocketClose(b, 1001, '', true);
    expect(a.messages('crew').filter((m) => m.op === 'leave')).toHaveLength(1);
  });
});

describe('start and t', () => {
  it('stores the first start and repeats it for later ones', () => {
    const a = join('a');
    const b = join('b');
    vi.setSystemTime(T0 + 500);
    send(a, { type: 'start' });
    const first = a.last('start');
    expect(first.startedAt).toBe(T0 + 500);
    expect(Number.isInteger(first.seed) && first.seed >= 0 && first.seed <= 0xffffffff).toBe(true);
    expect(b.last('start')).toEqual(first);
    vi.setSystemTime(T0 + 9000);
    send(b, { type: 'start' });
    expect(b.last('start')).toEqual(first);
    expect(join('c').last('welcome')).toMatchObject({ startedAt: first.startedAt, seed: first.seed });
  });

  it('answers t to the sender only', () => {
    const a = join('a');
    const b = join('b');
    vi.setSystemTime(T0 + 42);
    send(a, { type: 't', c: 123.5 });
    expect(a.last('t')).toEqual({ type: 't', c: 123.5, s: T0 + 42 });
    expect(b.messages('t')).toEqual([]);
  });

  it('ignores unknown types and bad fields', () => {
    const a = join('a');
    const before = a.sent.length;
    send(a, { type: 'nope' });
    send(a, { type: 't', c: 'x' });
    send(a, '[1,2]');
    expect(a.sent.length).toBe(before);
    expect(a.closed).toBeNull();
  });

  it('has a handler map for later pieces to extend', () => {
    expect(Object.keys(HANDLERS)).toEqual(expect.arrayContaining(['p', 'tel', 'start', 't', 'mk', 'smp', 'case']));
  });
});

describe('limits', () => {
  it('closes a message over 4 KB with 1009', () => {
    const a = join('a');
    send(a, JSON.stringify({ type: 't', c: 1, pad: 'x'.repeat(4096) }));
    expect(a.closed).toEqual({ code: CLOSE.TOO_BIG, reason: 'message too big' });
  });

  it('drops messages over the bucket and closes a flood with 1008', () => {
    const a = join('a');
    const b = join('b');
    // 40 messages at once: hello used one token, 29 are answered, the rest dropped.
    for (let i = 0; i < 40; i++) send(a, { type: 't', c: i });
    expect(a.messages('t')).toHaveLength(29);
    expect(a.closed).toBeNull();
    // 60 per second for 6 s
    let closedAt = null;
    for (let ms = 1000; ms < 7000 && !a.closed; ms += 1000 / 60) {
      vi.setSystemTime(T0 + ms);
      send(a, { type: 't', c: ms });
      if (a.closed) closedAt = ms;
    }
    expect(a.closed).toEqual({ code: CLOSE.POLICY, reason: 'rate limit' });
    expect(closedAt).toBeGreaterThanOrEqual(5000);
    expect(closedAt).toBeLessThan(7000);
    expect(b.last('crew')).toMatchObject({ op: 'leave', p: { id: 'a' } });
  });
});

describe('hibernation', () => {
  it('rebuilds the crew and the mission from attachments and SQLite in a new instance', () => {
    const a = join('a');
    const b = join('b', { role: 'habitat' });
    send(a, { type: 'start' });
    const started = a.last('start');

    // The runtime evicts the object and builds a new one over the same sockets and storage.
    room = new Room(createFakeCtx({ storage: ctx.storage, sockets: ctx.sockets }), {});
    expect(room.crew().map((e) => [e.id, e.role, e.color])).toEqual([['a', 'surface', 0], ['b', 'habitat', null]]);
    expect(room.mission()).toEqual({ startedAt: started.startedAt, seed: started.seed });

    send(b, { type: 'start' });
    expect(b.last('start')).toEqual(started);
    const c = join('c');
    expect(c.last('welcome').crew.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(a.last('crew')).toMatchObject({ op: 'join', p: { id: 'c', color: 1 } });
  });
});
