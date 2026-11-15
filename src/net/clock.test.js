import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClock } from './clock.js';

let t, sent, clock;
beforeEach(() => {
  vi.useFakeTimers();
  t = 1000;
  sent = [];
  clock = createClock({ send: (m) => sent.push(m), now: () => t, timers: globalThis });
});
afterEach(() => { clock.stop(); vi.useRealTimers(); });

/** Answers the last request: the server reads `serverAt` and the reply lands `back` ms later. */
function reply(up, back, serverOffset) {
  const req = sent[sent.length - 1];
  t = req.c + up;
  const s = t + serverOffset;
  t += back;
  return clock.handle({ type: 't', c: req.c, s });
}

describe('clock', () => {
  it('computes offset = s - (c0 + c1) / 2', () => {
    clock.start();
    reply(20, 20, 5000);
    expect(clock.offsetMs).toBe(5000);
    expect(clock.rttMs).toBe(40);
    expect(clock.serverNow()).toBe(t + 5000);
  });

  it('takes 5 samples one after another and keeps the shortest round trip', () => {
    clock.start();
    const rtts = [[100, 20], [10, 12], [80, 80], [30, 5], [50, 50]];
    for (const [up, back] of rtts) reply(up, back, 2000);
    expect(sent).toHaveLength(5);
    expect(clock.rttMs).toBe(22);
    // asymmetric paths: the error is half the asymmetry of the chosen sample, (10 - 12) / 2 = -1
    expect(clock.offsetMs).toBe(2000 - 1);
  });

  it('then takes one sample every 60 s and drops samples older than the last 5', () => {
    clock.start();
    reply(1, 1, 0);
    for (let i = 0; i < 4; i++) reply(50, 50, 0);
    expect(clock.rttMs).toBe(2);
    vi.advanceTimersByTime(59_999);
    expect(sent).toHaveLength(5);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(6);
    reply(40, 40, 300);
    // the 2 ms sample aged out; best is now 80 ms with offset 300
    expect(clock.rttMs).toBe(80);
    expect(clock.offsetMs).toBe(300);
  });

  it('moves on when a reply is lost and ignores replies it did not ask for', () => {
    clock.start();
    expect(clock.handle({ type: 't', c: 12345, s: 1 })).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(2);
    expect(clock.rttMs).toBeNull();
    expect(clock.offsetMs).toBe(0);
  });

  it('notifies on change and restarts cleanly', () => {
    const seen = [];
    clock.onChange((v) => seen.push(v));
    clock.start();
    reply(5, 5, 100);
    expect(seen).toEqual([{ offsetMs: 100, rttMs: 10 }]);
    clock.start();
    expect(sent).toHaveLength(3);
  });
});
