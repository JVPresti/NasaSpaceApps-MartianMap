import { describe, expect, it } from 'vitest';
import { createRedrawScheduler, MINIMAP_MAX_REDRAWS_PER_SECOND } from './minimapRedraw.js';

/** Deterministic timer harness: the scheduler never touches the real clock in these tests. */
function harness() {
  let nowMs = 0;
  let nextId = 0;
  let timers = [];
  const draws = [];

  const setTimer = (fn, delayMs) => {
    const timer = { id: ++nextId, atMs: nowMs + Math.max(0, delayMs), fn };
    timers.push(timer);
    return timer.id;
  };
  const clearTimer = (id) => {
    timers = timers.filter((timer) => timer.id !== id);
  };
  const scheduler = createRedrawScheduler({
    draw: (info) => draws.push({ ...info }),
    now: () => nowMs,
    setTimer,
    clearTimer,
  });

  function advance(ms) {
    const end = nowMs + ms;
    for (;;) {
      timers.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
      const next = timers.find((timer) => timer.atMs <= end);
      if (!next) break;
      timers = timers.filter((timer) => timer !== next);
      nowMs = next.atMs;
      next.fn();
    }
    nowMs = end;
  }

  return {
    scheduler, draws, advance,
    get pending() { return timers.length; },
    get nowMs() { return nowMs; },
  };
}

describe('minimap redraw budget', () => {
  it('paints the first request immediately', () => {
    const h = harness();
    expect(h.scheduler.request('mount')).toBe(true);
    expect(h.draws).toHaveLength(1);
    expect(h.draws[0]).toMatchObject({ index: 1, atMs: 0, reason: 'mount' });
  });

  it('coalesces store, image and resize requests inside the 100 ms window', () => {
    const h = harness();
    h.scheduler.request('mount');
    h.advance(20);
    expect(h.scheduler.request('store')).toBe(false);
    expect(h.scheduler.request('image')).toBe(false);
    expect(h.scheduler.request('resize')).toBe(false);
    expect(h.draws).toHaveLength(1);

    h.advance(79);
    expect(h.draws).toHaveLength(1);
    h.advance(1);
    expect(h.draws).toHaveLength(2);
    expect(h.draws[1]).toMatchObject({ index: 2, atMs: 100, reason: 'resize' });
  });

  it('never draws more than 10 times in any sliding second during a burst', () => {
    const h = harness();
    h.scheduler.request('store');
    for (let i = 1; i <= 1200; i++) {
      h.advance(1);
      h.scheduler.request('store');
    }
    const at = h.draws.map((draw) => draw.atMs);
    expect(at.length).toBeGreaterThan(10);
    for (const start of at) {
      expect(at.filter((t) => t >= start && t < start + 1000).length).toBeLessThanOrEqual(MINIMAP_MAX_REDRAWS_PER_SECOND);
    }
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(100);
  });

  it('stops after dispose and cancels a pending paint', () => {
    const h = harness();
    h.scheduler.request('mount');
    h.advance(30);
    h.scheduler.request('store');
    expect(h.pending).toBe(1);
    h.scheduler.dispose();
    expect(h.pending).toBe(0);
    h.advance(500);
    expect(h.draws).toHaveLength(1);
    expect(h.scheduler.request('resize')).toBe(false);
  });
});
