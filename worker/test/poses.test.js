import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, PROTOCOL_VERSION } from '../../src/net/protocol.js';
import { Room } from '../room.js';
import { POSE_HANDLERS } from '../handlers/poses.js';
import { FakeSocket, createFakeCtx } from './fakeCtx.js';

const T0 = 1_800_000_000_000;
let ctx, room, writes;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  ctx = createFakeCtx();
  // count every SQL statement that changes a row
  const exec = ctx.storage.sql.exec;
  writes = [];
  ctx.storage.sql.exec = (q, ...b) => { const c = exec(q, ...b); if (c.rowsWritten) writes.push(q); return c; };
  room = new Room(ctx, {});
});
afterEach(() => vi.useRealTimers());

const send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
function join(id, role = 'surface') {
  const ws = new FakeSocket();
  room.accept(ws, Date.now());
  send(ws, { type: 'hello', v: PROTOCOL_VERSION, id, name: 'Crew ' + id, role });
  return ws;
}
const pose = (extra = {}) => ({ type: 'p', x: 1.23, z: -4.56, h: 1.571, pt: -0.1, a: 'walk', hp: 0, ct: 1000, ex: 1.5, ez: -4, ...extra });

describe('pose relay (#53)', () => {
  it('relays p to every other seated socket with the sender id, not back to the sender', () => {
    const a = join('a'), b = join('b'), h = join('h', 'habitat');
    send(a, pose());
    expect(b.messages('p')).toEqual([{ ...pose(), id: 'a' }]);
    expect(h.messages('p')).toEqual([{ ...pose(), id: 'a' }]);
    expect(a.messages('p')).toEqual([]);
  });

  it('relays tel the same way', () => {
    const a = join('a'), b = join('b');
    send(a, { type: 'tel', o2: 87.5, bat: 91 });
    expect(b.last('tel')).toEqual({ type: 'tel', o2: 87.5, bat: 91, id: 'a' });
    expect(a.messages('tel')).toEqual([]);
  });

  it('overwrites a forged id with the real sender', () => {
    const a = join('a'), b = join('b');
    send(a, pose({ id: 'b' }));
    expect(b.last('p').id).toBe('a');
  });

  it('drops p and tel from a habitat seat', () => {
    const a = join('a'), h = join('h', 'habitat');
    send(h, pose());
    send(h, { type: 'tel', o2: 50, bat: 50 });
    expect(a.messages('p')).toEqual([]);
    expect(a.messages('tel')).toEqual([]);
    expect(h.closed).toBeNull();
  });

  it('drops a pose with bad fields and from a socket without a seat', () => {
    const a = join('a'), b = join('b');
    send(a, pose({ x: 'far' }));
    send(a, pose({ ex: 1, ez: undefined }));
    send(a, pose({ c: 2 }));
    expect(b.messages('p')).toEqual([]);
    const loose = new FakeSocket();
    room.accept(loose, Date.now());
    send(loose, pose());
    expect(loose.closed).toEqual({ code: CLOSE.HELLO_FIRST, reason: 'hello first' });
    expect(b.messages('p')).toEqual([]);
  });

  it('stores nothing: no SQL write for poses and telemetry', () => {
    const a = join('a'), b = join('b');
    const before = writes.length;
    for (let i = 0; i < 20; i++) { vi.setSystemTime(T0 + 100 * i); send(a, pose({ ct: i })); send(a, { type: 'tel', o2: 90, bat: 90 }); }
    expect(writes.length).toBe(before);
    expect(b.messages('p')).toHaveLength(20);
    expect(POSE_HANDLERS).toHaveProperty('p');
  });

  it('closes a client that sends 60 poses per second with 1008 within 5 to 7 s', () => {
    const a = join('a'), b = join('b');
    let closedAt = null;
    for (let ms = 0; ms < 8000 && !a.closed; ms += 1000 / 60) {
      vi.setSystemTime(T0 + ms);
      send(a, pose({ ct: ms }));
      if (a.closed) closedAt = ms;
    }
    expect(a.closed).toEqual({ code: CLOSE.POLICY, reason: 'rate limit' });
    expect(closedAt).toBeGreaterThanOrEqual(5000);
    expect(closedAt).toBeLessThan(7000);
    // the bucket let about 15 per second through to the other player, never the full 60
    expect(b.messages('p').length).toBeLessThan(30 + 15 * 7);
  });
});
