import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import * as protocol from './net/protocol.js';
import {
  CLOSE_REPLACED, CLOSE_ROOM_FULL, ROLE, ROLE_KEY, ROOM_CODE_PATTERN, ROOM_LETTERS, SEATS, bootOnline, createOnlineController,
  isHabitatSeat, randomRoomCode, readRoomCode, resetOnlineController, seatsLeft,
} from './onlineLink.js';
import { createInitialState } from './state/store.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function fakeLocation(search = '') {
  const loc = { href: 'http://localhost:8787/' + search, host: 'localhost:8787' };
  const history = { state: null, replaceState: vi.fn((_s, _t, url) => { loc.href = 'http://localhost:8787' + url; }) };
  return { location: loc, history };
}

/** A stand-in for src/net/index.js: startOnline writes the online slice like the real one and records its calls. */
function fakeNet(store) {
  const net = {
    calls: [], stops: 0, starts: 0, ids: 0,
    getPlayerName: () => 'Crew 1234',
    setPlayerName: vi.fn((name) => (String(name).trim() ? String(name).trim() : null)),
    newPlayerId: vi.fn(() => { net.ids++; return 'id' + net.ids; }),
    startOnline: vi.fn((opts) => {
      net.calls.push(opts);
      store.setState((s) => ({ online: { ...s.online, code: opts.code, status: 'connecting' } }));
      return {
        start: () => { net.starts++; return true; },
        stop: () => { net.stops++; store.setState({ online: createInitialState().online }); },
      };
    }),
  };
  return net;
}

const patch = (store, fields) => store.setState((s) => ({ online: { ...s.online, ...fields } }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { vi.unstubAllGlobals(); resetOnlineController(); });

describe('room codes', () => {
  it('reads ?room= in any case', () => {
    expect(readRoomCode('?room=abcd')).toEqual({ code: 'ABCD' });
    expect(readRoomCode('?x=1&room=TEST')).toEqual({ code: 'TEST' });
    expect(readRoomCode('?room=ABIO')).toEqual({ invalid: 'ABIO' });
    expect(readRoomCode('')).toBeNull();
    expect(readRoomCode('?mock=1')).toBeNull();
  });

  it('copies the protocol constants it may not import', () => {
    expect(ROOM_CODE_PATTERN.source).toBe(protocol.ROOM_CODE_PATTERN.source);
    expect(ROLE).toEqual(protocol.ROLE);
    expect(SEATS).toEqual(protocol.SEATS);
    expect(CLOSE_ROOM_FULL).toBe(protocol.CLOSE.ROOM_FULL);
    expect(CLOSE_REPLACED).toBe(protocol.CLOSE.REPLACED);
    expect([...ROOM_LETTERS].every((l) => ROOM_CODE_PATTERN.test(l.repeat(4)))).toBe(true);
    expect(ROOM_LETTERS).toHaveLength(24);
  });

  it('makes random codes that are always valid, never with I or O, over the whole alphabet', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const code = randomRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(protocol.normalizeRoomCode(code)).toBe(code);
      for (const l of code) seen.add(l);
    }
    expect(seen.size).toBe(24);
    expect(randomRoomCode(() => 0)).toBe('AAAA');
    expect(randomRoomCode(() => 0.999999)).toBe('ZZZZ');
  });

  it('counts the seats left without this player', () => {
    const crew = [{ id: 'a', role: 'surface' }, { id: 'b', role: 'surface' }, { id: 'h', role: 'habitat' }];
    expect(seatsLeft(crew, 'a')).toEqual({ surface: 3, habitat: 1 });
    expect(seatsLeft([], null)).toEqual({ surface: 4, habitat: 2 });
  });
});

describe('bootOnline keeps the offline path offline', () => {
  function spies() {
    const WebSocket = vi.fn();
    const fetch = vi.fn(() => Promise.resolve(new Response('')));
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('fetch', fetch);
    return { WebSocket, fetch, load: vi.fn(() => Promise.resolve({})), warn: vi.fn() };
  }
  const store = () => create(() => createInitialState());

  it('without ?room= it never loads src/net, opens a socket or fetches /api/', () => {
    for (const search of ['', '?', '?mock=1', '?debug=1&lang=es', undefined]) {
      const s = spies();
      const c = bootOnline({ search, store: store(), load: s.load, warn: s.warn, ...fakeLocation() });
      expect(c.session.getState().view).toBe('none');
      expect(s.load).not.toHaveBeenCalled();
      expect(s.WebSocket).not.toHaveBeenCalled();
      expect(s.fetch).not.toHaveBeenCalled();
      expect(s.warn).not.toHaveBeenCalled();
    }
  });

  it('with an invalid code it shows the message, warns and still loads nothing', () => {
    const s = spies();
    const c = bootOnline({ search: '?room=IOIO', store: store(), load: s.load, warn: s.warn, ...fakeLocation('?room=IOIO') });
    expect(c.session.getState()).toMatchObject({ view: 'bad', badCode: 'IOIO', code: null });
    expect(s.warn).toHaveBeenCalledOnce();
    expect(s.load).not.toHaveBeenCalled();
    expect(s.WebSocket).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('with a valid code it loads src/net but does not connect before Join', async () => {
    const s = spies();
    const st = store();
    const net = fakeNet(st);
    const load = vi.fn(() => Promise.resolve(net));
    const c = bootOnline({ search: '?room=test', store: st, load, warn: s.warn, ...fakeLocation('?room=test') });
    expect(c.session.getState()).toMatchObject({ view: 'join', code: 'TEST' });
    expect(load).toHaveBeenCalledOnce();
    await flush();
    expect(c.session.getState().net).toBe(net);
    expect(c.session.getState().name).toBe('Crew 1234');
    expect(net.startOnline).not.toHaveBeenCalled();
    expect(s.WebSocket).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
    expect(st.getState().online.status).toBe('off');
  });
});

describe('the join flow', () => {
  let store, net, c, loc, storage;
  beforeEach(() => {
    store = create(() => createInitialState());
    net = fakeNet(store);
    loc = fakeLocation();
    storage = memoryStorage();
    c = createOnlineController({ store, load: () => Promise.resolve(net), storage, ...loc, warn: () => {} });
  });

  it('Play online: a typed or new code goes into the link with replaceState and opens the join panel', () => {
    c.openPicker();
    expect(c.session.getState().view).toBe('pick');
    expect(c.openRoom('io12')).toBe(false);
    expect(c.openRoom('abcd')).toBe(true);
    expect(loc.history.replaceState).toHaveBeenCalledWith(null, '', '/?room=ABCD');
    expect(c.session.getState()).toMatchObject({ view: 'join', code: 'ABCD' });
  });

  it('Join starts online with the code, the seat and the name, and remembers the seat', async () => {
    c.openRoom('ABCD');
    c.setRole('habitat');
    c.setName('Ana');
    await c.join();
    expect(net.setPlayerName).toHaveBeenCalledWith('Ana');
    expect(net.calls).toEqual([{ code: 'ABCD', store, role: 'habitat' }]);
    expect(storage.getItem(ROLE_KEY)).toBe('habitat');
    expect(c.session.getState()).toMatchObject({ joining: true, joined: false });
    patch(store, { status: 'open', me: { id: 'me' }, crew: [{ id: 'me', role: 'habitat' }, { id: 'x', role: 'surface' }] });
    expect(c.session.getState()).toMatchObject({ joining: false, joined: true, seats: { surface: 3, habitat: 2 } });
    // a new controller starts from the remembered seat
    expect(createOnlineController({ store, load: () => Promise.resolve(net), storage, ...loc }).session.getState().role).toBe('habitat');
  });

  it('room full (4001): says which seat is full and can join the other one', async () => {
    c.openRoom('ABCD');
    await c.join();
    patch(store, { status: 'closed', closeCode: 4001 });
    expect(c.session.getState()).toMatchObject({ full: 'surface', joining: false, handle: null, seats: { surface: 0 } });
    expect(net.stops).toBe(1);
    await c.switchRole('habitat');
    expect(net.calls.at(-1)).toMatchObject({ role: 'habitat' });
    expect(c.session.getState().full).toBeNull();
  });

  it('replaced (4002): join as a new player makes a fresh id and joins again', async () => {
    c.openRoom('ABCD');
    await c.join();
    patch(store, { status: 'open' });
    patch(store, { status: 'closed', closeCode: 4002 });
    expect(c.session.getState().joined).toBe(true);
    await c.joinAsNewPlayer();
    expect(net.newPlayerId).toHaveBeenCalledOnce();
    expect(net.stops).toBe(1);
    expect(net.calls).toHaveLength(2);
  });

  it('offline after 3 failures still continues into the game, solo', async () => {
    c.openRoom('ABCD');
    await c.join();
    patch(store, { status: 'offline' });
    expect(c.session.getState()).toMatchObject({ joining: false, joined: true });
  });

  it('a surface player who steps outside sends start once; a habitat seat never does', async () => {
    c.openRoom('ABCD');
    await c.join();
    patch(store, { status: 'open', startedAtMs: null });
    store.setState({ mode: 'walk' });
    store.setState({ mode: 'walk', view: { ...store.getState().view, layer: 2 } });
    expect(net.starts).toBe(1);
    patch(store, { startedAtMs: 1000 });
    store.setState({ mode: 'plan' });
    expect(net.starts).toBe(1);

    const s2 = create(() => createInitialState());
    const n2 = fakeNet(s2);
    const c2 = createOnlineController({ store: s2, load: () => Promise.resolve(n2), storage: memoryStorage(), ...fakeLocation(), warn: () => {} });
    c2.openRoom('ABCD');
    c2.setRole('habitat');
    await c2.join();
    patch(s2, { status: 'open' });
    s2.setState({ mode: 'walk' });
    expect(n2.starts).toBe(0);
  });

  it('leave stops the room and drops ?room= from the link', async () => {
    c.openRoom('ABCD');
    await c.join();
    c.leave();
    expect(net.stops).toBe(1);
    expect(loc.location.href).toBe('http://localhost:8787/');
    expect(c.session.getState()).toMatchObject({ view: 'none', code: null, handle: null });
  });
});

describe('isHabitatSeat', () => {
  it('is true only while the app controller holds a habitat seat', async () => {
    const store = create(() => createInitialState());
    const net = fakeNet(store);
    expect(isHabitatSeat()).toBe(false);
    const c = bootOnline({ search: '?room=ABCD', store, load: () => Promise.resolve(net), storage: memoryStorage(), ...fakeLocation(), warn: () => {} });
    c.setRole('habitat');
    expect(isHabitatSeat()).toBe(false);
    await c.join();
    expect(isHabitatSeat()).toBe(true);
    c.leave();
    expect(isHabitatSeat()).toBe(false);
  });
});
