import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { claimSample, mayCallCase } from '../state/sharedHooks.js';
import { createInitialState } from '../state/store.js';
import { SAMPLE_CLAIM_TIMEOUT_MS } from './protocol.js';
import { connectRoom } from './room.js';
import { NOTICE_MS, SHARED_OFFLINE, createSharedState } from './sharedState.js';
import { createSocketFactory, welcomeFor } from './testSocket.js';
import { startOnline } from './index.js';

const ME = 'me1';
let f, store, room, shared, cids;

beforeEach(() => {
  vi.useFakeTimers();
  f = createSocketFactory();
  store = create(() => createInitialState());
  room = connectRoom({ code: 'ABCD', url: 'ws://test/api/room/ABCD', hello: { type: 'hello' }, WebSocketImpl: f.FakeWebSocket });
  cids = 0;
  shared = createSharedState({ store, room, playerId: ME, makeCid: () => 'cid-' + (++cids) });
});
afterEach(() => { shared.stop(); room.close(); vi.useRealTimers(); });

const ws = () => f.last();
const sent = (type) => ws().json().filter((m) => m.type === type);
const row = (id, cid, extra = {}) => ({ id, cid, author: 'b', kind: 'find', x: 1, z: 2, label: 'M01', at: 100 + id, ...extra });
function welcome(extra = {}) {
  ws().receive(welcomeFor(ME, { crew: [{ id: ME, name: 'Me', color: 0, role: 'surface', joinedAt: 1 }, { id: 'b', name: 'Bea', color: 1, role: 'surface', joinedAt: 2 }], ...extra }));
}
function openRoom(extra) { ws().open(); welcome(extra); }
const markFind = (id, x = 3, z = 4) => store.setState((s) => ({ finds: { ...s.finds, list: [...s.finds.list, { id, label: 'M0' + id.slice(-1), x, z, status: 'pricing' }] } }));

describe('shared slice', () => {
  it('defaults match the store', () => {
    expect(createInitialState().shared).toEqual(SHARED_OFFLINE);
  });

  it('every welcome rebuilds markers, samples and the case holder from the room', () => {
    openRoom({ markers: [row(1, 'x1'), row(2, 'x2')], samples: [{ sid: 'site-cheyava-falls', by: 'b', at: 5 }], caseHolder: 'b' });
    let s = store.getState().shared;
    expect(s.markers.map((m) => [m.id, m.cid, m.pending])).toEqual([[1, 'x1', false], [2, 'x2', false]]);
    expect(s.samples).toEqual({ 'site-cheyava-falls': { by: 'b', at: 5 } });
    expect(s.caseHolder).toBe('b');
    ws().drop();
    vi.advanceTimersByTime(600);
    openRoom({ markers: [row(1, 'x1')], samples: [], caseHolder: null });
    s = store.getState().shared;
    expect(s.markers.map((m) => m.cid)).toEqual(['x1']);
    expect(s.samples).toEqual({});
    expect(s.caseHolder).toBe(null);
  });

  it('applies mk, smp and case broadcasts', () => {
    openRoom();
    ws().receive({ type: 'mk', ...row(7, 'x7', { kind: 'note', label: 'Ridge' }) });
    ws().receive({ type: 'smp', sid: 'rock_10_20', by: 'b', at: 9, ok: true });
    ws().receive({ type: 'case', holder: 'b' });
    const s = store.getState().shared;
    expect(s.markers).toEqual([{ ...row(7, 'x7', { kind: 'note', label: 'Ridge' }), pending: false }]);
    expect(s.samples.rock_10_20).toEqual({ by: 'b', at: 9 });
    expect(s.caseHolder).toBe('b');
    expect(mayCallCase()).toBe(true);   // hooks not installed here: offline answer
    expect(shared.mayCallCase()).toBe(false);
  });

  it('puts the room state back when the store is reset (a restart)', () => {
    openRoom({ markers: [row(1, 'x1')] });
    store.setState({ ...createInitialState() }, true);
    expect(store.getState().shared.markers.map((m) => m.cid)).toEqual(['x1']);
  });
});

describe('markers', () => {
  it('a local find becomes an mk with kind find, once', () => {
    openRoom();
    markFind('find-1', 12.345, -6.789);
    expect(sent('mk')).toEqual([{ type: 'mk', cid: 'cid-1', kind: 'find', x: 12.35, z: -6.79, label: 'M01' }]);
    store.setState((s) => ({ finds: { ...s.finds, list: s.finds.list.map((x) => ({ ...x, status: 'priced' })) } }));
    expect(sent('mk')).toHaveLength(1);
    expect(store.getState().shared.findCids).toEqual({ 'find-1': 'cid-1' });
    expect(store.getState().shared.markers[0]).toMatchObject({ cid: 'cid-1', pending: true, author: ME });
    ws().receive({ type: 'mk', ...row(3, 'cid-1', { author: ME, x: 12.35, z: -6.79 }) });
    expect(store.getState().shared.markers).toEqual([{ ...row(3, 'cid-1', { author: ME, x: 12.35, z: -6.79 }), pending: false }]);
  });

  it('markers placed offline go out once on the welcome, and not again on a second welcome', () => {
    markFind('find-1');
    shared.addMarker({ kind: 'note', x: 5, z: 6, label: 'Ridge' });
    expect(store.getState().shared.markers.map((m) => [m.cid, m.pending])).toEqual([['cid-1', true], ['cid-2', true]]);
    openRoom();
    expect(sent('mk').map((m) => m.cid)).toEqual(['cid-1', 'cid-2']);
    ws().receive({ type: 'mk', ...row(1, 'cid-1', { author: ME }) });
    ws().drop();
    vi.advanceTimersByTime(600);
    // the room has cid-1 and cid-2 (its echo of cid-2 was lost with the socket): nothing goes out again
    openRoom({ markers: [row(1, 'cid-1', { author: ME }), row(2, 'cid-2', { author: ME, kind: 'note' })] });
    expect(sent('mk')).toEqual([]);
    expect(shared.pending().markers).toEqual([]);
  });

  it('a marker the room never got is sent again on the next welcome', () => {
    openRoom();
    shared.addMarker({ kind: 'go', x: 1, z: 1 });
    expect(sent('mk')).toHaveLength(1);
    ws().drop();
    vi.advanceTimersByTime(600);
    openRoom();
    expect(sent('mk').map((m) => m.cid)).toEqual(['cid-1']);
  });

  it('retries markers the client action cap refused', () => {
    openRoom();
    for (let i = 0; i < 8; i++) shared.addMarker({ kind: 'note', x: i, z: 0 });
    expect(sent('mk')).toHaveLength(5);
    vi.advanceTimersByTime(1000);
    expect(sent('mk').map((m) => m.cid)).toEqual(Array.from({ length: 8 }, (_, i) => 'cid-' + (i + 1)));
  });
});

describe('sample claims', () => {
  const claim = (sid = 'site-cheyava-falls') => shared.claimSample({ sid, kind: 'rock', site: 'Cheyava Falls', x: 0, z: 0 });

  it('win: the claim waits for the room and resolves ok', async () => {
    openRoom();
    const p = claim();
    expect(p).toBeInstanceOf(Promise);
    expect(sent('smp')).toEqual([{ type: 'smp', sid: 'site-cheyava-falls' }]);
    ws().receive({ type: 'smp', sid: 'site-cheyava-falls', by: ME, at: 50, ok: true });
    await expect(p).resolves.toEqual({ ok: true, by: ME });
    expect(store.getState().shared.samples['site-cheyava-falls']).toEqual({ by: ME, at: 50 });
    expect(claim()).toEqual({ ok: true, by: ME });   // own sample: taking it again is allowed, no message
    expect(sent('smp')).toHaveLength(1);
  });

  it('lose: resolves not ok with the winner and shows the notice for a few seconds', async () => {
    openRoom();
    const p = claim();
    ws().receive({ type: 'smp', sid: 'site-cheyava-falls', by: 'b', at: 40, ok: true });   // the broadcast of b's win
    await expect(p).resolves.toEqual({ ok: false, by: 'b' });
    expect(store.getState().shared.notice).toMatchObject({ key: 'sample-taken', by: 'b' });
    ws().receive({ type: 'smp', sid: 'site-cheyava-falls', by: 'b', at: 40, ok: false });  // the reply to our claim changes nothing
    expect(claim()).toEqual({ ok: false, by: 'b' });   // known locally now: refused without a message
    expect(sent('smp')).toHaveLength(1);
    vi.advanceTimersByTime(NOTICE_MS);
    expect(store.getState().shared.notice).toBe(null);
  });

  it('timeout: goes ahead locally after 1.5 s and sends the claim again on the next welcome', async () => {
    openRoom();
    const p = claim('soil_3_4');
    vi.advanceTimersByTime(SAMPLE_CLAIM_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ ok: true, by: ME, timedOut: true });
    expect(store.getState().shared.samples.soil_3_4).toMatchObject({ by: ME, pending: true });
    ws().drop();
    vi.advanceTimersByTime(600);
    openRoom();
    expect(sent('smp')).toEqual([{ type: 'smp', sid: 'soil_3_4' }]);
    expect(store.getState().shared.samples.soil_3_4).toMatchObject({ pending: true });
    ws().receive({ type: 'smp', sid: 'soil_3_4', by: ME, at: 70, ok: true });
    expect(store.getState().shared.samples.soil_3_4).toEqual({ by: ME, at: 70 });
    expect(shared.pending().claims).toEqual([]);
  });

  it('offline: proceeds at once, queues the claim; a welcome saying someone else took it shows the notice', () => {
    expect(claim()).toEqual({ ok: true, by: ME });
    openRoom({ samples: [{ sid: 'site-cheyava-falls', by: 'b', at: 3 }] });
    expect(sent('smp')).toEqual([]);
    expect(store.getState().shared.samples['site-cheyava-falls']).toEqual({ by: 'b', at: 3 });
    expect(store.getState().shared.notice).toMatchObject({ key: 'sample-taken', by: 'b' });
  });

  it('offline claim sent once on the welcome, not again on a second welcome that has it', () => {
    claim('rock_1_2');
    openRoom();
    expect(sent('smp')).toHaveLength(1);
    ws().drop();
    vi.advanceTimersByTime(600);
    openRoom({ samples: [{ sid: 'rock_1_2', by: ME, at: 8 }] });
    expect(sent('smp')).toEqual([]);
    expect(store.getState().shared.notice).toBe(null);
  });
});

describe('tool case', () => {
  const caseState = (cs) => store.setState((s) => ({ sampling: { ...s.sampling, status: { phase: 'idle', caseState: cs, actions: {} } } }));

  it('the local hand-over takes the case and gives it back', () => {
    openRoom();
    caseState('carried');
    caseState('coming');
    expect(sent('case')).toEqual([{ type: 'case', holder: ME }]);
    ws().receive({ type: 'case', holder: ME });
    caseState('down');
    caseState('picking-up');
    expect(sent('case')).toHaveLength(1);
    caseState('carried');
    expect(sent('case')).toEqual([{ type: 'case', holder: ME }, { type: 'case', holder: null }]);
  });

  it('a refusal shows who has it', () => {
    openRoom();
    caseState('coming');
    ws().receive({ type: 'case', holder: 'b' });
    expect(store.getState().shared).toMatchObject({ caseHolder: 'b', notice: { key: 'case-held', by: 'b' } });
    expect(shared.mayCallCase()).toBe(false);
  });
});

describe('startOnline installs the hooks', () => {
  it('claimSample and mayCallCase reach the room through src/state/sharedHooks.js, and stop removes them', () => {
    const store2 = create(() => createInitialState());
    const h = startOnline({ code: 'ABCD', store: store2, url: 'ws://test/api/room/ABCD', WebSocketImpl: f.FakeWebSocket });
    f.last().open();
    const id = f.last().json()[0].id;
    f.last().receive(welcomeFor(id, { caseHolder: 'other' }));
    expect(mayCallCase()).toBe(false);
    expect(claimSample({ sid: 'rock_1_1' })).toBeInstanceOf(Promise);
    h.stop();
    expect(mayCallCase()).toBe(true);
    expect(claimSample({ sid: 'rock_1_1' })).toBe(null);
    expect(store2.getState().shared).toEqual(SHARED_OFFLINE);
  });
});
