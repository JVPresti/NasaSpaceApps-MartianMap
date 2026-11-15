import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { createInitialState } from '../state/store.js';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY, resetIdentityMemory, setPlayerName } from './identity.js';
import { OFFLINE_STATE, startOnline } from './index.js';
import { createSocketFactory, welcomeFor } from './testSocket.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

let f, store, handle;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('localStorage', memoryStorage());
  resetIdentityMemory();
  f = createSocketFactory();
  store = create(() => createInitialState());
});
afterEach(() => { handle?.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const go = (opts = {}) => (handle = startOnline({ code: 'abcd', store, url: 'ws://test/api/room/ABCD', WebSocketImpl: f.FakeWebSocket, ...opts }));

describe('startOnline', () => {
  it('matches the store defaults', () => {
    expect(createInitialState().online).toEqual(OFFLINE_STATE);
  });

  it('rejects a bad code', () => {
    expect(() => startOnline({ code: 'IOIO', store })).toThrow(/bad room code/);
  });

  it('sends hello with a per-tab id and the stored name, then fills the online slice', () => {
    setPlayerName('Ana');
    go();
    expect(store.getState().online).toMatchObject({ code: 'ABCD', status: 'connecting' });
    f.last().open();
    const hello = f.last().json()[0];
    expect(hello).toEqual({ type: 'hello', v: 1, id: sessionStorage.getItem(PLAYER_ID_KEY), name: 'Ana', role: 'surface' });
    const me = { id: hello.id, name: 'Ana', color: 2, role: 'surface', joinedAt: 10 };
    f.last().receive(welcomeFor(hello.id, { you: { id: hello.id, color: 2, role: 'surface' }, crew: [me], startedAt: 500, seed: 7 }));
    expect(store.getState().online).toMatchObject({ status: 'open', me, crew: [me], startedAtMs: 500, seed: 7, closeCode: null });
    // the clock started: one t request out
    expect(f.last().json().filter((m) => m.type === 't')).toHaveLength(1);
  });

  it('keeps the crew list from join and leave messages', () => {
    go();
    f.last().open();
    const id = f.last().json()[0].id;
    f.last().receive(welcomeFor(id));
    const b = { id: 'b', name: 'B', color: 1, role: 'surface', joinedAt: 2 };
    f.last().receive({ type: 'crew', op: 'join', p: b });
    f.last().receive({ type: 'crew', op: 'join', p: { ...b, color: 3 } });
    expect(store.getState().online.crew.map((e) => [e.id, e.color])).toEqual([[id, 0], ['b', 3]]);
    f.last().receive({ type: 'crew', op: 'leave', p: b });
    expect(store.getState().online.crew.map((e) => e.id)).toEqual([id]);
  });

  it('asks for the colour it had after a reload', () => {
    go();
    f.last().open();
    const id = f.last().json()[0].id;
    f.last().receive(welcomeFor(id, { you: { id, color: 3, role: 'surface' } }));
    handle.stop();
    expect(store.getState().online).toEqual(OFFLINE_STATE);
    go();
    f.last().open();
    expect(f.last().json()[0]).toMatchObject({ id, color: 3 });
  });

  it('writes the start, the clock offset and the close code', () => {
    let t = 1000;
    go({ now: () => t, timers: globalThis });
    f.last().open();
    f.last().receive(welcomeFor(f.last().json()[0].id));
    f.last().receive({ type: 'start', startedAt: 900, seed: 42 });
    const req = f.last().json().find((m) => m.type === 't');
    t = req.c + 30;
    f.last().receive({ type: 't', c: req.c, s: req.c + 15 + 250 });
    expect(store.getState().online).toMatchObject({ startedAtMs: 900, seed: 42, offsetMs: 250, rttMs: 30 });
    f.last().drop(4002, 'replaced');
    expect(store.getState().online).toMatchObject({ status: 'closed', closeCode: 4002 });
  });

  it('works when storage throws', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    vi.stubGlobal('sessionStorage', broken);
    vi.stubGlobal('localStorage', broken);
    go();
    f.last().open();
    const hello = f.last().json()[0];
    expect(hello.id).toMatch(/^[0-9a-f]{18}$/);
    expect(hello.name).toMatch(/^Crew \d{4}$/);
    expect(localStorage).toBe(broken);
    expect(PLAYER_NAME_KEY).toBeTruthy();
  });

  it('two tabs get two ids', () => {
    go();
    f.last().open();
    const first = f.last().json()[0].id;
    handle.stop();
    vi.stubGlobal('sessionStorage', memoryStorage());
    resetIdentityMemory();
    go();
    f.last().open();
    expect(f.last().json()[0].id).not.toBe(first);
  });
});
