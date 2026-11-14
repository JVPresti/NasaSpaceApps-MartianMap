import { describe, expect, it } from 'vitest';
import { createStepTracker, STEP_WALK_M, STEP_JOG_M, FOOT_OFFSET_M } from './bootPrintRules.js';

// walk north (toward -z) at a given speed for a number of seconds, 60 frames a second; facing is optional
function walk(tracker, speed, seconds, facing) {
  const dt = 1 / 60, prints = [];
  let z = 0;
  tracker.track(0, z, dt, facing);
  for (let i = 0; i < seconds * 60; i++) { z -= speed * dt; prints.push(...tracker.track(0, z, dt, facing)); }
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
    const prints = walk(createStepTracker(), 3, 10);   // 30 m
    expect(prints.length).toBe(Math.round(30 / STEP_JOG_M));
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
    const t = createStepTracker();
    t.track(0, 0, 1 / 60);
    expect(t.track(0, 0, 1 / 60)).toEqual([]);
    expect(t.track(50, 50, 1 / 60)).toEqual([]);
  });
});
