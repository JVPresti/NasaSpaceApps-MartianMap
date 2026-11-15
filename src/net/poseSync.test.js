import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createInitialState } from '../state/store.js';
import { CLIENT_RATE, MSG, encode, utf8ByteLength, validate } from './protocol.js';
import {
  INTERP_DELAY_MS, createPoseBuffer, createPoseSender, createTelemetrySender, poseMessage, remoteSurfacePlayers,
  startPoseSync, usesRemotePartners,
} from './poseSync.js';

const DEG = Math.PI / 180;

function sender({ hz } = {}) {
  const clock = { ms: 0 }, sent = [];
  const pose = { x: 0, z: 0, headingRad: 0, pitchRad: 0, gait: 'idle', ex: 0, ez: 0 };
  const s = createPoseSender({ send: (m) => { sent.push(m); return true; }, read: () => ({ ...pose }), now: () => clock.ms, hz });
  return { s, sent, clock, pose };
}

/** Calls tick() every frame at 60 fps for `sec` seconds, applying move(t) first. */
function run(h, sec, move = () => {}) {
  const frames = Math.round(sec * 60);
  for (let i = 0; i < frames; i++) { h.clock.ms += 1000 / 60; move(h.clock.ms / 1000); h.s.tick(); }
}

describe('pose message', () => {
  it('rounds to cm and 3 decimals, adds the estimate, never a height, and fits in 120 bytes', () => {
    const m = poseMessage({ x: -123.4567, z: 678.9012, headingRad: 7, pitchRad: -0.12345, gait: 'walk', ex: -121.33, ez: 677.06 }, 1763150000123.4);
    expect(m).toEqual({ type: 'p', x: -123.46, z: 678.9, h: 0.717, pt: -0.123, a: 'walk', hp: 0, ct: 1763150000123, ex: -121.3, ez: 677.1 });
    expect(m).not.toHaveProperty('y');
    expect(validate(m)).toEqual(m);
    expect(utf8ByteLength(encode(m))).toBeLessThan(120);
    expect(utf8ByteLength(encode({ ...m, id: 'p1a2b3c4d5e6f7g8' }))).toBeLessThanOrEqual(145);
  });

  it('carries the optional action, case and lamp only when set', () => {
    const m = poseMessage({ x: 0, z: 0, headingRad: 0, gait: 'idle', action: { name: 'case_set_down', timeSec: 0.4 }, carrying: false, lampOn: true }, 5);
    expect(m).toMatchObject({ ac: 'case_set_down', at: 0.4, c: 0, l: 1 });
    expect(validate(m)).toEqual(m);
  });
});

describe('pose sender', () => {
  it('sends the first pose, then nothing while the player stands still', () => {
    const h = sender();
    run(h, 0.1);
    expect(h.sent).toHaveLength(1);
    run(h, 30);
    expect(h.sent).toHaveLength(1);
  });

  it('standing still, a navigation estimate that moves more than 0.5 m sends a pose (#55: the habitat map draws it)', () => {
    const h = sender();
    h.s.tick();
    h.clock.ms += 1000; h.pose.ex = 0.4; h.s.tick();
    expect(h.sent).toHaveLength(1);
    h.clock.ms += 1000; h.pose.ex = 0.6; h.s.tick();
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toMatchObject({ x: 0, z: 0, ex: 0.6 });
    // a teleport whose pose went out with the old estimate: the next estimate follows while standing
    h.clock.ms += 1000; h.pose.x = 30; h.s.tick();
    h.clock.ms += 1000; h.pose.ex = 30; h.s.tick();
    expect(h.sent.map((m) => [m.x, m.ex])).toEqual([[0, 0], [0, 0.6], [30, 0.6], [30, 30]]);
  });

  it('ignores moves up to 5 cm and turns up to 1 degree, sends past them', () => {
    const h = sender();
    h.s.tick();
    h.clock.ms += 1000; h.pose.x = 0.049; h.pose.headingRad = 0.99 * DEG; h.s.tick();
    expect(h.sent).toHaveLength(1);
    h.clock.ms += 1000; h.pose.x = 0.051; h.s.tick();
    expect(h.sent).toHaveLength(2);
    h.clock.ms += 1000; h.pose.headingRad = 0.99 * DEG + 1.01 * DEG; h.s.tick();
    expect(h.sent).toHaveLength(3);
  });

  it('turning across north counts the short way round', () => {
    const h = sender();
    h.pose.headingRad = 359.5 * DEG; h.s.tick();
    h.clock.ms += 1000; h.pose.headingRad = 0.3 * DEG; h.s.tick();
    expect(h.sent).toHaveLength(1);
  });

  it('a change of gait or action sends even without moving', () => {
    const h = sender();
    h.s.tick();
    h.clock.ms += 300; h.pose.gait = 'walk'; h.s.tick();
    h.clock.ms += 300; h.pose.action = { name: 'case_set_down', timeSec: 0 }; h.s.tick();
    expect(h.sent.map((m) => [m.a, m.ac])).toEqual([['idle', undefined], ['walk', undefined], ['walk', 'case_set_down']]);
  });

  it('walking sends 5 poses per second by default, called every frame', () => {
    const h = sender();
    run(h, 10, (t) => { h.pose.x = t * 1.0; h.pose.gait = 'walk'; });   // 1 m/s
    expect(h.sent.length).toBeGreaterThanOrEqual(49);
    expect(h.sent.length).toBeLessThanOrEqual(51);
  });

  it('never goes above 10 per second, even when asked for more', () => {
    const h = sender({ hz: 60 });
    run(h, 10, (t) => { h.pose.x = t * 3; h.pose.headingRad = t; });
    expect(h.sent.length).toBeLessThanOrEqual(10 * CLIENT_RATE.poseMaxHz + 1);
    expect(h.sent.length).toBeGreaterThanOrEqual(85);   // 60 fps frames land 100 or 117 ms apart
    const gaps = h.sent.slice(1).map((m, i) => m.ct - h.sent[i].ct);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1000 / CLIENT_RATE.poseMaxHz - 1);
  });

  it('sends the stop: the last pose with the idle gait, once the rate allows', () => {
    const h = sender();
    run(h, 2, (t) => { h.pose.x = t; h.pose.gait = 'walk'; });
    const n = h.sent.length;
    h.pose.gait = 'idle';
    run(h, 5);
    expect(h.sent.length).toBe(n + 1);
    expect(h.sent.at(-1).a).toBe('idle');
    expect(h.sent.at(-1).x).toBeCloseTo(h.pose.x, 2);
  });

  it('a crew join sends the current pose once, even standing still', () => {
    const h = sender();
    run(h, 1);
    expect(h.sent).toHaveLength(1);
    h.s.forceNext();
    run(h, 5);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1].x).toBe(h.sent[0].x);
  });
});

describe('telemetry sender', () => {
  it('sends tel every 5 s, rounded, only while there is a reading', () => {
    const clock = { ms: 0 }, sent = [];
    let suit = null;
    const tel = createTelemetrySender({ send: (m) => { sent.push(m); return true; }, read: () => suit, now: () => clock.ms });
    for (let i = 0; i < 20; i++) { clock.ms += 1000; tel.tick(); }
    expect(sent).toEqual([]);
    suit = { oxygenPct: 87.456, batteryPct: 90.04 };
    for (let i = 0; i < 20; i++) { clock.ms += 1000; tel.tick(); }
    expect(sent).toHaveLength(4);
    expect(sent[0]).toEqual({ type: 'tel', o2: 87.5, bat: 90 });
  });
});

describe('pose buffer', () => {
  const p = (ct, x, h = 0, extra = {}) => ({ type: 'p', x, z: 0, h, pt: 0, a: 'walk', hp: 0, ct, ...extra });

  it('renders 150 ms behind and interpolates between the two samples around that time', () => {
    const b = createPoseBuffer();
    // the sender clock is 10 s ahead; deliveries take 50 ms, one late at 120 ms
    b.push(p(10_000, 0), 50);
    b.push(p(10_200, 1), 320);
    b.push(p(10_400, 2), 450);
    expect(INTERP_DELAY_MS).toBe(150);
    expect(b.sample(150 + 50).x).toBeCloseTo(0, 6);          // render time 50 = first sample
    expect(b.sample(150 + 150).x).toBeCloseTo(0.5, 6);       // half way to the second
    expect(b.sample(150 + 350).x).toBeCloseTo(1.5, 6);
    expect(b.sample(150 + 150).speedMs).toBeCloseTo(5, 6);   // 1 m in 0.2 s
  });

  it('turns the heading the short way round', () => {
    const b = createPoseBuffer();
    b.push(p(0, 0, 350 * Math.PI / 180), 0);
    b.push(p(200, 0, 10 * Math.PI / 180), 200);
    const h = b.sample(150 + 100).h * 180 / Math.PI;
    expect(h === 0 || Math.abs(h - 360) < 1e-6 || Math.abs(h) < 1e-6).toBe(true);
    expect(b.sample(150 + 50).h * 180 / Math.PI).toBeCloseTo(355, 6);
  });

  it('holds the last pose when the buffer runs dry, and the first before it starts', () => {
    const b = createPoseBuffer();
    expect(b.sample(0)).toBeNull();
    b.push(p(0, 4), 0);
    b.push(p(200, 6), 200);
    expect(b.sample(100)).toMatchObject({ x: 4, held: true });
    expect(b.sample(10_000)).toMatchObject({ x: 6, held: true, speedMs: 0 });
  });

  it('drops late and repeated poses and keeps at most 20', () => {
    const b = createPoseBuffer();
    b.push(p(100, 1), 100);
    expect(b.push(p(100, 2), 110)).toBe(false);
    expect(b.push(p(50, 3), 120)).toBe(false);
    for (let i = 1; i <= 30; i++) b.push(p(100 + i * 100, i), 100 + i * 100);
    expect(b.size).toBe(20);
    expect(b.latest().x).toBe(30);
  });
});

describe('scripted or remote partners', () => {
  const crew = [
    { id: 'me', name: 'Me', color: 0, role: 'surface', joinedAt: 1 },
    { id: 'hab', name: 'Hab', color: null, role: 'habitat', joinedAt: 2 },
    { id: 'b', name: 'Bea', color: 2, role: 'surface', joinedAt: 3 },
  ];
  const online = (status, list = crew) => ({ status, me: list[0], crew: list, code: 'ABCD' });

  it('lists the other surface players only', () => {
    expect(remoteSurfacePlayers(online('open')).map((e) => e.id)).toEqual(['b']);
  });

  it('uses the remote players while another surface player is in the room and the link has not given up', () => {
    expect(usesRemotePartners(online('open'))).toBe(true);
    expect(usesRemotePartners(online('connecting'))).toBe(true);
    expect(usesRemotePartners(online('offline'))).toBe(false);
    expect(usesRemotePartners(online('closed'))).toBe(false);
    expect(usesRemotePartners(online('open', crew.slice(0, 2)))).toBe(false);
    expect(usesRemotePartners({ status: 'off', crew: [] })).toBe(false);
  });
});

describe('startPoseSync', () => {
  function setup() {
    const store = create(() => createInitialState());
    const listeners = new Map(), out = [];
    const room = {
      send: (m) => { out.push(m); return true; },
      on: (type, fn) => { listeners.set(type, fn); return () => listeners.delete(type); },
    };
    const emit = (m) => listeners.get(m.type)?.(validate(m));
    const player = { x: 10, z: 20, headingDeg: 90, pitch: 0, moveSpeed: 0 };
    const calls = [];
    const engine = { getPlayer: () => ({ ...player }), setPartnerSources: (list) => calls.push(list) };
    const clock = { ms: 1000 };
    const timers = { setInterval: () => 1, clearInterval: () => {} };
    const sync = startPoseSync({ room, store, getEngine: () => engine, timers, now: () => clock.ms });
    const me = { id: 'me', name: 'Me', color: 0, role: 'surface', joinedAt: 1 };
    const bea = { id: 'b', name: 'Bea', color: 2, role: 'surface', joinedAt: 2 };
    const setOnline = (patch) => store.setState((s) => ({ online: { ...s.online, code: 'ABCD', ...patch } }));
    return { store, out, emit, player, calls, clock, sync, me, bea, setOnline };
  }

  it('swaps the scripted partner for remote suits and back when the room goes offline', () => {
    const h = setup();
    h.setOnline({ status: 'open', me: h.me, crew: [h.me] });
    expect(h.calls.at(-1)).toEqual([]);
    h.setOnline({ crew: [h.me, h.bea] });
    expect(h.calls.at(-1).map((p) => [p.id, p.name, p.color])).toEqual([['b', 'Bea', [0.1, 0.8, 0.3]]]);
    h.setOnline({ status: 'offline' });
    expect(h.calls.at(-1)).toEqual([]);
    h.setOnline({ status: 'open' });
    expect(h.calls.at(-1).map((p) => p.id)).toEqual(['b']);
    h.setOnline({ crew: [h.me] });
    expect(h.calls.at(-1)).toEqual([]);
  });

  it('feeds received poses and telemetry into the net partner, and forgets a player who left', () => {
    const h = setup();
    h.setOnline({ status: 'open', me: h.me, crew: [h.me, h.bea] });
    h.emit({ type: MSG.POSE, id: 'b', x: 5, z: 6, h: Math.PI / 2, pt: 0, a: 'walk', hp: 0, ct: 50, ex: 5.5, ez: 6.5 });
    h.emit({ type: MSG.TELEMETRY, id: 'b', o2: 80, bat: 70 });
    const partner = h.sync.partners.get('b');
    h.clock.ms += 500;
    const st = partner.update(0.016, null);
    expect(st).toMatchObject({ visible: true, x: 5, z: 6, gait: 'walk' });
    expect(partner.radio()).toMatchObject({ name: 'Bea', x: 5.5, z: 6.5, oxygenPct: 80, batteryPct: 70 });
    h.emit({ type: MSG.CREW, op: 'leave', p: h.bea });
    h.setOnline({ crew: [h.me] });
    expect(h.sync.partners.size).toBe(0);
    expect(h.sync.buffers.size).toBe(0);
  });

  it('sends our pose only as a surface player with an open room, and once more when someone joins', () => {
    const h = setup();
    h.sync.tick();
    expect(h.out).toEqual([]);
    h.setOnline({ status: 'open', me: h.me, crew: [h.me] });
    h.sync.tick();
    expect(h.out.filter((m) => m.type === 'p')).toHaveLength(1);
    expect(h.out[0]).toMatchObject({ x: 10, z: 20, h: 1.571, a: 'idle' });
    for (let i = 0; i < 100; i++) { h.clock.ms += 50; h.sync.tick(); }
    expect(h.out.filter((m) => m.type === 'p')).toHaveLength(1);
    h.emit({ type: MSG.CREW, op: 'join', p: h.bea });
    h.clock.ms += 50; h.sync.tick();
    expect(h.out.filter((m) => m.type === 'p')).toHaveLength(2);
  });

  it('a frame loop that stopped mid-walk (hidden tab) reads as standing after 400 ms', () => {
    const h = setup();
    h.setOnline({ status: 'open', me: h.me, crew: [h.me] });
    h.player.moveSpeed = 1;
    for (let i = 0; i < 10; i++) { h.clock.ms += 50; h.player.x += 0.05; h.sync.tick(); }
    expect(h.out.filter((m) => m.type === 'p').at(-1).a).toBe('walk');
    for (let i = 0; i < 20; i++) { h.clock.ms += 50; h.sync.tick(); }   // x frozen, moveSpeed stale at 1
    expect(h.out.filter((m) => m.type === 'p').at(-1).a).toBe('idle');
  });

  it('a habitat player sends no poses and no telemetry', () => {
    const h = setup();
    h.store.setState((s) => ({ suit: { ...s.suit, oxygenPct: 90, batteryPct: 90 } }));
    h.setOnline({ status: 'open', me: { ...h.me, role: 'habitat', color: null }, crew: [] });
    for (let i = 0; i < 200; i++) { h.clock.ms += 50; h.player.x += 0.1; h.sync.tick(); }
    expect(h.out).toEqual([]);
  });

  it('sends telemetry every 5 s from the suit store', () => {
    const h = setup();
    h.store.setState((s) => ({ suit: { ...s.suit, oxygenPct: 90, batteryPct: 80 } }));
    h.setOnline({ status: 'open', me: h.me, crew: [h.me] });
    for (let i = 0; i < 200; i++) { h.clock.ms += 50; h.sync.tick(); }
    expect(h.out.filter((m) => m.type === 'tel')).toHaveLength(2);
  });

  it('stop gives the scripted partner back', () => {
    const h = setup();
    h.setOnline({ status: 'open', me: h.me, crew: [h.me, h.bea] });
    h.sync.stop();
    expect(h.calls.at(-1)).toEqual([]);
  });
});
