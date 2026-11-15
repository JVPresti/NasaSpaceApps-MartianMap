import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MARKERS, PROTOCOL_VERSION } from '../../src/net/protocol.js';
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

const send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
function join(id, extra = {}) {
  const ws = new FakeSocket();
  room.accept(ws, Date.now());
  send(ws, { type: 'hello', v: PROTOCOL_VERSION, id, name: 'Crew ' + id, role: 'surface', ...extra });
  return ws;
}
function clientClose(ws) {
  ws.close(1000);
  room.webSocketClose(ws, 1000, '', true);
  ctx.finishClose(ws);
}
/** A new Room object over the same storage and sockets: what a wake from hibernation or a reload of the object sees. */
function wake() {
  ctx = createFakeCtx({ storage, sockets: ctx.sockets });
  room = new Room(ctx, {});
}
const mk = (cid, extra = {}) => ({ type: 'mk', cid, kind: 'find', x: 12.5, z: -3.25, label: 'M01', ...extra });

describe('markers', () => {
  it('stores a marker with the sender as author and broadcasts the row to everyone', () => {
    const a = join('a'), b = join('b');
    send(a, mk('a-1'));
    const row = { type: 'mk', id: 1, cid: 'a-1', author: 'a', kind: 'find', x: 12.5, z: -3.25, label: 'M01', at: T0 };
    expect(a.last('mk')).toEqual(row);
    expect(b.last('mk')).toEqual(row);
    expect(storage.db.prepare('SELECT client_id, author FROM markers').all().map((r) => ({ ...r }))).toEqual([{ client_id: 'a-1', author: 'a' }]);
  });

  it('ignores a resend with a known cid: no second row, no broadcast, the stored row back to the sender only', () => {
    const a = join('a'), b = join('b');
    send(a, mk('a-1'));
    vi.setSystemTime(T0 + 5000);
    send(a, mk('a-1', { x: 99, label: 'changed' }));
    expect(storage.db.prepare('SELECT COUNT(*) AS n FROM markers').get().n).toBe(1);
    expect(b.messages('mk')).toHaveLength(1);
    expect(a.messages('mk')).toHaveLength(2);
    expect(a.last('mk')).toMatchObject({ id: 1, x: 12.5, label: 'M01', at: T0 });
  });

  it('a cid taken by another player stays theirs', () => {
    const a = join('a'), b = join('b');
    send(a, mk('same'));
    send(b, mk('same', { x: 1 }));
    expect(b.last('mk')).toMatchObject({ author: 'a', x: 12.5 });
    expect(a.messages('mk')).toHaveLength(1);
  });

  it('checks the kind: find only from the surface, note and go from anyone, nothing else', () => {
    const a = join('a'), h = join('h', { role: 'habitat' });
    send(h, mk('h-1'));
    send(a, mk('a-1', { kind: 'rock' }));
    expect(a.messages('mk')).toHaveLength(0);
    send(h, mk('h-2', { kind: 'note', label: 'Check this ridge' }));
    send(h, mk('h-3', { kind: 'go' }));
    expect(a.messages('mk').map((m) => [m.kind, m.author])).toEqual([['note', 'h'], ['go', 'h']]);
  });

  it('keeps at most MAX_MARKERS', () => {
    const a = join('a');
    const insert = storage.db.prepare('INSERT INTO markers (client_id, author, kind, x, z, label, at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < MAX_MARKERS; i++) insert.run('seed-' + i, 'a', 'find', 0, 0, '', T0);
    send(a, mk('one-more'));
    expect(a.messages('mk')).toHaveLength(0);
    expect(storage.db.prepare('SELECT COUNT(*) AS n FROM markers').get().n).toBe(MAX_MARKERS);
  });
});

describe('samples', () => {
  it('two players claim the same sample: one ok:true broadcast, the loser alone gets ok:false with the winner', () => {
    const a = join('a'), b = join('b'), c = join('c');
    send(a, { type: 'smp', sid: 'site-cheyava-falls' });
    vi.setSystemTime(T0 + 20);
    send(b, { type: 'smp', sid: 'site-cheyava-falls' });
    const win = { type: 'smp', sid: 'site-cheyava-falls', by: 'a', at: T0, ok: true };
    for (const ws of [a, b, c]) expect(ws.messages('smp').filter((m) => m.ok)).toEqual([win]);
    expect(b.last('smp')).toEqual({ ...win, ok: false });
    expect(a.messages('smp')).toHaveLength(1);
    expect(c.messages('smp')).toHaveLength(1);
  });

  it('rowsWritten on the insert cursor decides the winner', () => {
    const a = join('a');
    const exec = storage.sql.exec;
    const seen = [];
    storage.sql.exec = (q, ...b) => { const cur = exec(q, ...b); if (q.startsWith('INSERT INTO samples')) seen.push(cur.rowsWritten); return cur; };
    send(a, { type: 'smp', sid: 's1' });
    send(join('b'), { type: 'smp', sid: 's1' });
    expect(seen).toEqual([1, 0]);
  });

  it('a resend by the winner is ok:true to the sender only', () => {
    const a = join('a'), b = join('b');
    send(a, { type: 'smp', sid: 's1' });
    send(a, { type: 'smp', sid: 's1' });
    expect(a.messages('smp').map((m) => m.ok)).toEqual([true, true]);
    expect(b.messages('smp')).toHaveLength(1);
  });

  it('the habitat seat cannot take samples', () => {
    const h = join('h', { role: 'habitat' });
    send(h, { type: 'smp', sid: 's1' });
    expect(h.messages('smp')).toHaveLength(0);
    expect(storage.db.prepare('SELECT COUNT(*) AS n FROM samples').get().n).toBe(0);
  });
});

describe('tool case', () => {
  it('anyone on the surface takes a free case for themselves; others are told who has it', () => {
    const a = join('a'), b = join('b');
    send(b, { type: 'case', holder: 'a' });   // cannot take it for someone else
    expect(b.last('case')).toEqual({ type: 'case', holder: null });
    expect(a.messages('case')).toHaveLength(0);
    send(a, { type: 'case', holder: 'a' });
    expect(a.last('case')).toEqual({ type: 'case', holder: 'a' });
    expect(b.last('case')).toEqual({ type: 'case', holder: 'a' });
    send(b, { type: 'case', holder: 'b' });
    expect(b.last('case')).toEqual({ type: 'case', holder: 'a' });
    expect(a.messages('case')).toHaveLength(1);
  });

  it('the holder puts it back or hands it to a seated surface player', () => {
    const a = join('a'), b = join('b'), h = join('h', { role: 'habitat' });
    send(a, { type: 'case', holder: 'a' });
    send(a, { type: 'case', holder: 'h' });
    expect(a.last('case').holder).toBe('a');
    send(a, { type: 'case', holder: 'nobody' });
    expect(a.last('case').holder).toBe('a');
    send(a, { type: 'case', holder: 'b' });
    expect(h.last('case').holder).toBe('b');
    send(b, { type: 'case', holder: null });
    expect(a.last('case').holder).toBe(null);
    send(h, { type: 'case', holder: 'h' });
    expect(h.last('case').holder).toBe(null);
    expect(a.messages('case')).toHaveLength(5);   // its own take, two refusals, the hand-over and b's put-back
  });

  it('a holder who leaves releases it; a reload that replaces the socket does not', () => {
    const a = join('a'), b = join('b');
    send(a, { type: 'case', holder: 'a' });
    join('a');   // the same player again: replaces the socket, no leave
    expect(b.last('case').holder).toBe('a');
    const a2 = ctx.sockets[ctx.sockets.length - 1];
    clientClose(a2);
    expect(b.last('case')).toEqual({ type: 'case', holder: null });
    expect(join('c').last('welcome').caseHolder).toBe(null);
    void a;
  });
});

describe('welcome', () => {
  it('a new Room over the same storage restores markers, samples and the case holder', () => {
    const a = join('a'), b = join('b');
    send(a, mk('a-1'));
    vi.setSystemTime(T0 + 10);
    send(b, mk('b-1', { kind: 'find', x: 1, z: 2, label: 'M01' }));
    send(a, { type: 'smp', sid: 'site-bright-angel' });
    send(a, { type: 'case', holder: 'a' });
    wake();
    const c = join('c');
    const w = c.last('welcome');
    expect(w.markers).toEqual([
      { id: 1, cid: 'a-1', author: 'a', kind: 'find', x: 12.5, z: -3.25, label: 'M01', at: T0 },
      { id: 2, cid: 'b-1', author: 'b', kind: 'find', x: 1, z: 2, label: 'M01', at: T0 + 10 },
    ]);
    expect(w.samples).toEqual([{ sid: 'site-bright-angel', by: 'a', at: T0 + 10 }]);
    expect(w.caseHolder).toBe('a');
    // a resend after the wake is still ignored
    send(a, mk('a-1'));
    expect(c.messages('mk')).toHaveLength(0);
  });

  it('a welcome with 50 markers stays small', () => {
    const a = join('a');
    for (let i = 0; i < 50; i++, vi.setSystemTime(T0 + i * 100)) send(a, mk('marker-cid-' + String(i).padStart(4, '0'), { x: 1234.56, z: -987.65, label: 'M' + String(i % 8 + 1).padStart(2, '0') }));
    const text = join('b').sent.find((t) => t.includes('"welcome"'));
    expect(JSON.parse(text).markers).toHaveLength(50);
    expect(text.length).toBeLessThan(8000);
  });
});
