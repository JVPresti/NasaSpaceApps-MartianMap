import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectRoom, roomUrl } from './room.js';
import { createSocketFactory, welcomeFor } from './testSocket.js';

const HELLO = { type: 'hello', v: 1, id: 'p1', name: 'Crew 1', role: 'surface' };
let f, room, statuses;

beforeEach(() => {
  vi.useFakeTimers();
  f = createSocketFactory();
  statuses = [];
});
afterEach(() => { room?.close(); vi.useRealTimers(); });

function start(hello = HELLO) {
  room = connectRoom({ code: 'ABCD', hello, url: 'ws://test/api/room/ABCD', WebSocketImpl: f.FakeWebSocket, timers: globalThis });
  room.onStatus((s, info) => statuses.push([s, info.code]));
  return room;
}

describe('room URL', () => {
  it('uses the page origin, wss on https', () => {
    expect(roomUrl('ABCD', { protocol: 'https:', host: 'mars.example' })).toBe('wss://mars.example/api/room/ABCD');
    expect(roomUrl('ABCD', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/room/ABCD');
  });
});

describe('connectRoom', () => {
  it('sends hello on open and becomes open on welcome', () => {
    start();
    expect(room.status).toBe('connecting');
    f.last().open();
    expect(f.last().json()).toEqual([HELLO]);
    f.last().receive(welcomeFor('p1'));
    expect(room.status).toBe('open');
  });

  it('delivers validated messages to listeners and ignores pong and junk', () => {
    start();
    const got = [];
    const off = room.on('crew', (m) => got.push(m));
    room.on('*', (m) => got.push('any:' + m.type));
    f.last().open();
    f.last().receive('pong');
    f.last().receive('garbage');
    f.last().receive({ type: 'crew', op: 'join', p: { id: 'x' } });
    const join = { type: 'crew', op: 'join', p: { id: 'p2', name: 'B', color: 1, role: 'surface', joinedAt: 2 } };
    f.last().receive(join);
    off();
    f.last().receive(join);
    expect(got).toEqual([join, 'any:crew', 'any:crew']);
  });

  it('reconnects after 0.5, 1, 2, 4, 8, 8 s and goes offline after 3 failed reconnects', () => {
    start();
    const opened = [0];
    const delays = [];
    let t = 0;
    for (let i = 0; i < 6; i++) {
      f.last().fail();
      const before = f.sockets.length;
      let waited = 0;
      while (f.sockets.length === before) { vi.advanceTimersByTime(100); waited += 100; }
      t += waited;
      delays.push(waited);
      opened.push(t);
      if (i === 2) expect(room.status).toBe('connecting');
      if (i === 3) expect(room.status).toBe('offline');
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
    expect(statuses.map((s) => s[0])).toEqual(['offline']);
  });

  it('resets the back-off after a welcome and resends hello on every reconnect', () => {
    let n = 0;
    start(() => ({ ...HELLO, name: 'Crew ' + ++n }));
    f.last().fail();
    vi.advanceTimersByTime(500);
    f.last().fail();
    vi.advanceTimersByTime(1000);
    f.last().open();
    f.last().receive(welcomeFor('p1'));
    f.last().drop(1001);
    vi.advanceTimersByTime(499);
    expect(f.sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(f.sockets).toHaveLength(4);
    f.last().open();
    expect(f.last().json()[0]).toMatchObject({ type: 'hello', name: 'Crew 2' });
    expect(f.sockets[2].json()[0]).toMatchObject({ name: 'Crew 1' });
  });

  it('does not reconnect after 4001 room full or 4002 replaced, and reports the code', () => {
    for (const code of [4001, 4002]) {
      f = createSocketFactory();
      statuses = [];
      start();
      f.last().open();
      f.last().drop(code, code === 4001 ? 'room full' : 'replaced');
      vi.advanceTimersByTime(60_000);
      expect(f.sockets).toHaveLength(1);
      expect(room.status).toBe('closed');
      expect(room.info).toMatchObject({ code });
      expect(statuses).toEqual([['closed', code]]);
    }
  });

  it('does not reconnect after close()', () => {
    start();
    f.last().open();
    room.close();
    expect(f.last().closedWith).toBe(1000);
    vi.advanceTimersByTime(60_000);
    expect(f.sockets).toHaveLength(1);
    expect(room.status).toBe('closed');
    f.last().fail();
    expect(f.sockets).toHaveLength(1);
  });

  it('pings every 10 s while open', () => {
    start();
    f.last().open();
    const pings = () => f.last().sent.filter((d) => d === 'ping').length;
    vi.advanceTimersByTime(9_999);
    expect(pings()).toBe(0);
    f.last().receive('pong');
    vi.advanceTimersByTime(1);
    expect(pings()).toBe(1);
    for (let i = 0; i < 3; i++) { f.last().receive('pong'); vi.advanceTimersByTime(10_000); }
    expect(pings()).toBe(4);
    f.last().drop(1006);
    vi.advanceTimersByTime(400);
    expect(f.sockets[0].sent.filter((d) => d === 'ping')).toHaveLength(4);
  });

  it('treats 30 s without any message as a drop', () => {
    start();
    f.last().open();
    vi.advanceTimersByTime(39_999);
    expect(f.sockets[0].readyState).toBe(1);
    vi.advanceTimersByTime(1);
    expect(f.sockets[0].readyState).toBe(3);
    vi.advanceTimersByTime(500);
    expect(f.sockets).toHaveLength(2);
  });

  it('gives up on a connection that never opens', () => {
    start();
    vi.advanceTimersByTime(5000);
    expect(f.sockets[0].readyState).toBe(3);
    vi.advanceTimersByTime(500);
    expect(f.sockets).toHaveLength(2);
  });

  it('sends only while open and caps actions at 5 per second', () => {
    start();
    expect(room.send({ type: 'start' })).toBe(false);
    f.last().open();
    const sent = Array.from({ length: 8 }, () => room.send({ type: 'start' }));
    expect(sent).toEqual([true, true, true, true, true, false, false, false]);
    expect(Array.from({ length: 8 }, (_, i) => room.send({ type: 't', c: i })).every(Boolean)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(room.send({ type: 'start' })).toBe(true);
  });
});
