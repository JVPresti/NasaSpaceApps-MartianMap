import { describe, expect, it } from 'vitest';
import {
  bobCycle,
  clipTime,
  clipTimeScale,
  createGait,
  stepGait,
  STOOP_SPEED_MS,
  swingPhase,
  WALK_CLIP_SEC,
  WALK_SPEED_MS,
} from './gait.js';

describe('stepGait', () => {
  it('advances by distance and wraps within a stride', () => {
    const g = createGait();
    expect(stepGait(g, 0.25, false)).toBe(0);
    expect(g.phase).toBeCloseTo(0.25, 12);
    expect(stepGait(g, 0.25, false)).toBe(1);   // crossed the half-stride footfall
    expect(g.phase).toBeCloseTo(0, 12);
    expect(stepGait(g, 0.75, false)).toBe(1);   // 0.75 crosses 0.5
    expect(g.phase).toBeCloseTo(0.25, 12);
    expect(stepGait(g, 0.25, false)).toBe(1);   // 0.25 + 0.25 reaches the next footfall
    expect(g.phase).toBeCloseTo(0, 12);
  });

  it('counts a footfall at every half stride, walk and jog', () => {
    const g = createGait();
    let n = 0;
    for (let i = 0; i < 8; i++) n += stepGait(g, 0.25, false);
    expect(n).toBe(4);   // 2 m walked, one footfall per 0.5 m
    const j = createGait();
    let m = 0;
    for (let i = 0; i < 8; i++) m += stepGait(j, 0.25, true);
    expect(m).toBe(2);   // 2 m jogged, one footfall per 1.0 m (2 m stride)
  });

  it('runs backward: the phase decreases and footfalls still count', () => {
    const g = createGait();
    stepGait(g, 0.2, false);
    expect(stepGait(g, -0.3, false)).toBe(1);
    expect(g.phase).toBeCloseTo(0.4, 12);   // -0.1 wrapped into [0, 0.5)
  });
});

describe('the shared cadences', () => {
  it('puts the bounce at its minimum and the sway at zero on every footfall (#228)', () => {
    const g = createGait();
    for (let i = 0; i < 4; i++) {
      expect(stepGait(g, 0.5, false)).toBe(1);
      const c = bobCycle(g);
      expect(c.bounce).toBeCloseTo(-1, 6);
      expect(c.sway).toBeCloseTo(0, 6);
    }
  });

  it('peaks the bounce halfway through a step', () => {
    const g = createGait();
    stepGait(g, 0.25, false);
    expect(bobCycle(g).bounce).toBeCloseTo(1, 6);
  });

  it('gives one arm swing per stride and the walk clip time per metre', () => {
    const g = createGait();
    stepGait(g, 0.3, false);
    expect(swingPhase(g)).toBeCloseTo(Math.PI * 0.6, 9);
    expect(clipTime(g)).toBeCloseTo(WALK_CLIP_SEC * 0.3, 9);
    stepGait(g, 0.1, false);
    expect(swingPhase(g)).toBeCloseTo(Math.PI * 0.8, 6);
    expect(clipTime(g)).toBeCloseTo(WALK_CLIP_SEC * 0.4, 9);
  });
});

describe('clipTimeScale', () => {
  it('retimes a clip from its authored speed', () => {
    expect(clipTimeScale(WALK_SPEED_MS, WALK_SPEED_MS)).toBeCloseTo(1, 9);
    expect(clipTimeScale(2, WALK_SPEED_MS)).toBeCloseTo(2 / WALK_SPEED_MS, 9);
    expect(clipTimeScale(0.458, STOOP_SPEED_MS)).toBeGreaterThan(1);   // stooped: the clip plays faster than authored
    expect(clipTimeScale(0.5, 0)).toBe(1);   // unknown authored speed: leave the clip alone
  });
});
