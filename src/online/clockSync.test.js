import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { startMissionClock } from '../sim/missionClock.js';
import { createInitialState } from '../state/store.js';
import { sharedStartMs, startClockSync } from './clockSync.js';

/** One simulated client: its own store, its own wall clock, the real mission clock and the clock sync. */
function client({ offsetMs, serverNow }) {
  const store = create(() => createInitialState());
  const now = () => serverNow() - offsetMs;          // local clock = server clock - offset
  const clock = startMissionClock({ store, now, storage: null, setInterval: () => null, clearInterval: () => {} });
  const stopSync = startClockSync(store);
  return { store, clock, now, stop: () => { stopSync(); clock.stop(); } };
}

const room = (store, fields) => store.setState((s) => ({ online: { ...s.online, code: 'ABCD', status: 'open', ...fields } }));

describe('shared mission clock', () => {
  it('computes the local start from the room start and the offset', () => {
    expect(sharedStartMs({ code: 'ABCD', startedAtMs: 10_000, offsetMs: 250 })).toBe(9750);
    expect(sharedStartMs({ code: 'ABCD', startedAtMs: null, offsetMs: 250 })).toBeNull();
    expect(sharedStartMs({ code: null, startedAtMs: 10_000, offsetMs: 0 })).toBeNull();
  });

  it('two clients with different offsets read the same mission time within 1 ms from the same start', () => {
    let server = 1_000_000;
    const serverNow = () => server;
    const a = client({ offsetMs: 0, serverNow });
    const b = client({ offsetMs: -3_456.7, serverNow });   // b's wall clock runs 3.4567 s ahead
    // both arrive at different moments and have run local clocks of their own since
    server += 5_000;
    a.clock.tick(); b.clock.tick();
    const startedAt = server - 2_000;
    room(a.store, { startedAtMs: startedAt, offsetMs: 0 });
    room(b.store, { startedAtMs: startedAt, offsetMs: -3_456.7 });
    for (const step of [0, 1_234, 60_000, 600_000]) {
      server += step;
      a.clock.tick(); b.clock.tick();
      const ea = a.store.getState().mission.elapsedSec;
      const eb = b.store.getState().mission.elapsedSec;
      expect(Math.abs(ea - eb) * 1000).toBeLessThan(1);
      expect(ea).toBeCloseTo((server - startedAt) / 1000, 6);
    }
    a.stop(); b.stop();
  });

  it('a player who joins after the start gets the running clock', () => {
    const server = 50_000_000;
    const late = client({ offsetMs: 120, serverNow: () => server });
    room(late.store, { startedAtMs: server - 7 * 60_000, offsetMs: 120 });
    late.clock.tick();
    expect(late.store.getState().mission.elapsedSec).toBeCloseTo(420, 6);
    late.stop();
  });

  it('online there is no pause: a pause write leaves the clock and its reading running', () => {
    let server = 2_000_000;
    const c = client({ offsetMs: 0, serverNow: () => server });
    c.store.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(c.store.getState().mission.paused).toBe(true);    // offline (no room) the pause holds
    room(c.store, { startedAtMs: server, offsetMs: 0 });
    expect(c.store.getState().mission.paused).toBe(false);
    c.store.setState((s) => ({ mission: { ...s.mission, paused: true } }));   // what pauseMission() writes
    expect(c.store.getState().mission.paused).toBe(false);
    c.clock.pause();
    server += 30_000;
    c.clock.tick();
    expect(c.store.getState().mission.elapsedSec).toBeCloseTo(30, 6);
    c.stop();
  });

  it('a new clock (a new EVA) follows the shared start from its first reading', () => {
    const server = 9_000_000;
    const store = create(() => createInitialState());
    store.setState((s) => ({ online: { ...s.online, code: 'ABCD', status: 'open', startedAtMs: server - 90_000, offsetMs: 0 } }));
    const stopSync = startClockSync(store);
    const clock = startMissionClock({ store, now: () => server, storage: null, setInterval: () => null, clearInterval: () => {}, restore: false });
    expect(store.getState().mission.elapsedSec).toBeCloseTo(90, 6);
    clock.stop(); stopSync();
  });

  it('leaving the room keeps the reading and runs on from it', () => {
    let server = 3_000_000;
    const c = client({ offsetMs: 0, serverNow: () => server });
    room(c.store, { startedAtMs: server - 10_000, offsetMs: 0 });
    c.store.setState({ online: createInitialState().online });
    expect(c.store.getState().mission.sharedStartMs).toBeNull();
    server += 5_000;
    c.clock.tick();
    expect(c.store.getState().mission.elapsedSec).toBeCloseTo(15, 6);
    c.stop();
  });
});
