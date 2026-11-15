import { describe, expect, it } from 'vitest';
import { createStepTracker, createPrintStore, seatPrint, STEP_WALK_M, STEP_JOG_M, FOOT_OFFSET_M, MIN_GAP_M } from './bootPrintRules.js';

// walk north (toward -z) at a given speed for a number of seconds, 60 frames a second; facing and jog are optional
function walk(tracker, speed, seconds, facing, jog = false, dirX = 0) {
  const dt = 1 / 60, prints = [], emit = (x, z, yaw, side) => prints.push({ x, z, yaw, side });
  let x = 0, z = 0;
  const k = 1 / Math.hypot(dirX, 1);
  tracker.track(x, z, facing, jog, emit);
  for (let i = 0; i < seconds * 60; i++) { x += speed * dt * dirX * k; z -= speed * dt * k; tracker.track(x, z, facing, jog, emit); }
  return prints;
}

describe('createStepTracker', () => {
  it('leaves one print every half metre while walking, alternating feet', () => {
    const prints = walk(createStepTracker(), 1, 10);   // 10 m
    expect(prints.length).toBe(Math.round(10 / STEP_WALK_M));
    expect(prints[0].side).toBe(-prints[1].side);
    expect(Math.abs(prints[1].z - prints[0].z)).toBeCloseTo(STEP_WALK_M, 2);
  });
  it('takes longer steps when jogging', () => {
    const prints = walk(createStepTracker(), 3, 10, undefined, true);   // 30 m
    expect(prints.length).toBe(Math.round(30 / STEP_JOG_M));
  });
  it('keeps the walking stride when walking diagonally at 1.41 m/s', () => {
    const prints = walk(createStepTracker(), Math.SQRT2, 10, undefined, false, 1);   // W + D: 14.1 m
    expect(prints.length).toBe(Math.floor(10 * Math.SQRT2 / STEP_WALK_M));
  });
  it('puts the feet either side of the walking line, facing the way the walker goes', () => {
    const [a, b] = walk(createStepTracker(), 1, 2);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(2 * FOOT_OFFSET_M, 5);
    expect(a.yaw).toBeCloseTo(0, 5);   // north
  });
  it('points the toes the way the walker faces when walking backwards', () => {
    const prints = walk(createStepTracker(), 1, 2, Math.PI);   // moving north while facing south
    expect(prints.every((p) => Math.abs(p.yaw - Math.PI) < 1e-9)).toBe(true);
    // left and right follow the facing too: the right foot (side 1) is on the facing's right, the west side
    const right = prints.find((p) => p.side === 1);
    expect(right.x).toBeLessThan(0);
  });
  it('points the toes forward when stepping sideways', () => {
    const prints = walk(createStepTracker(), 1, 2, Math.PI / 2);   // moving north while facing east
    expect(prints.every((p) => Math.abs(p.yaw - Math.PI / 2) < 1e-9)).toBe(true);
  });
  it('leaves nothing while standing still or after a teleport', () => {
    const t = createStepTracker(), out = [], emit = (...a) => out.push(a);
    t.track(0, 0, undefined, false, emit);
    expect(t.track(0, 0, undefined, false, emit)).toBe(0);
    expect(t.track(50, 50, undefined, false, emit)).toBe(0);
    expect(out).toEqual([]);
  });
  it('starts from a travelled seed: the first print lands at step - seed, on the shared gait phase (#228)', () => {
    const t = createStepTracker(), prints = [], emit = (x, z, yaw, side) => prints.push({ x, z, yaw, side });
    let z = 0;
    t.track(0, z, undefined, false, emit, 0.3);   // the gait is 0.3 m into the current step
    for (let i = 0; i < 120; i++) { z -= 1 / 60; t.track(0, z, undefined, false, emit, 0.3); }
    expect(prints.length).toBeGreaterThan(0);
    expect(Math.abs(prints[0].z)).toBeCloseTo(STEP_WALK_M - 0.3, 2);   // 0.2 m walked, then a print
    expect(Math.abs(prints[1].z - prints[0].z)).toBeCloseTo(STEP_WALK_M, 2);
  });
});

describe('createPrintStore', () => {
  it('keeps the last `capacity` prints and drops the oldest first', () => {
    const s = createPrintStore(4);
    for (let i = 0; i < 6; i++) s.add(i, 0, 0, 1);
    expect(s.count).toBe(4);
    expect(Array.from(s.x).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });
  it('skips a print within MIN_GAP_M of one already there, and accepts it once that one is gone', () => {
    const s = createPrintStore(2);
    expect(s.add(0, 0, 0, 1)).toBe(0);
    expect(s.add(MIN_GAP_M * 0.9, 0, 0, -1)).toBe(-1);
    expect(s.add(0, MIN_GAP_M * 1.1, 0, -1)).toBe(1);
    expect(s.add(5, 5, 0, 1)).toBe(0);                     // ring wraps: the print at the origin goes
    expect(s.add(MIN_GAP_M * 0.9, 0, 0, -1)).toBe(1);      // so this spot is free again
  });
  it('finds close prints across cell borders and negative coordinates', () => {
    const s = createPrintStore(100);
    s.add(-0.001, -0.001, 0, 1);
    expect(s.add(0.01, 0.01, 0, 1)).toBe(-1);
    expect(s.add(-0.14, 0, 0, 1)).toBe(-1);
    expect(s.add(-0.2, 0, 0, 1)).toBeGreaterThanOrEqual(0);
  });
  it('holds a patrol line to a bounded number of prints', () => {
    // 100 passes over the same 47 m line: the spacing check stops it growing after the first few
    const s = createPrintStore(4000), t = createStepTracker();
    const emit = (x, z, yaw, side) => s.add(x, z, yaw, side);
    let z = 0, dir = -1;
    t.track(0, z, 0, false, emit);
    for (let pass = 0; pass < 100; pass++) {
      for (let i = 0; i < 47 * 60; i++) { z += dir / 60; t.track(0, z, dir < 0 ? 0 : Math.PI, false, emit); }
      dir = -dir;
    }
    // two foot lines of 47 m, at most one print per MIN_GAP_M on each
    expect(s.count).toBeLessThanOrEqual(2 * Math.ceil(47 / MIN_GAP_M));
  });
});

describe('seatPrint', () => {
  const out = { y: 0, ux: 0, uy: 0, uz: 0 };
  it('lies flat at the lift on flat ground', () => {
    seatPrint(() => 3, 1, 2, 0.4, 0.12, 0.22, 0.015, out);
    expect(out.y).toBeCloseTo(3.015, 9);
    expect(out.uy).toBeCloseTo(1, 9);
  });
  it('tilts with a plane slope and stays on it', () => {
    const h = (x, z) => 0.3 * x - 0.1 * z;
    seatPrint(h, 2, 5, 1.1, 0.12, 0.22, 0, out);
    expect(out.y).toBeCloseTo(h(2, 5), 9);
    const n = Math.hypot(0.3, 1, 0.1);
    expect(out.ux).toBeCloseTo(-0.3 / n, 9); expect(out.uy).toBeCloseTo(1 / n, 9); expect(out.uz).toBeCloseTo(0.1 / n, 9);
  });
  it('rises over a ridge under the middle of the sole', () => {
    const h = (x) => 0.2 - Math.abs(x);   // ridge along z through x = 0
    seatPrint(h, 0, 0, 0, 0.12, 0.22, 0, out);
    expect(out.y).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });
});
