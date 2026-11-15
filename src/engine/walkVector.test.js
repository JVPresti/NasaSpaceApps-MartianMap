import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JOG_SPEED, WALK_SPEED } from './view.js';
import { walkVector } from './walkVector.js';

const hazards = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'),
);

const speed = (v) => Math.hypot(v.x, v.y);

describe('walkVector', () => {
  it('keeps the keyboard mapping exactly: one axis at WALK_SPEED, Shift at JOG_SPEED', () => {
    expect(walkVector({ keyY: 1, keySpeed: WALK_SPEED })).toEqual({ x: 0, y: WALK_SPEED });
    expect(walkVector({ keyY: -1, keySpeed: JOG_SPEED })).toEqual({ x: 0, y: -JOG_SPEED });
    expect(walkVector({ keyX: 1, keySpeed: WALK_SPEED })).toEqual({ x: WALK_SPEED, y: 0 });
  });

  it('leaves the keyboard diagonal unnormalised, as before analogue input existed', () => {
    const v = walkVector({ keyX: 1, keyY: 1, keySpeed: WALK_SPEED });
    expect(v.x).toBeCloseTo(WALK_SPEED, 10);
    expect(v.y).toBeCloseTo(WALK_SPEED, 10);
    expect(speed(v)).toBeCloseTo(Math.SQRT2 * WALK_SPEED, 10);
  });

  it('scales analogue movement in proportion to its magnitude', () => {
    const half = walkVector({ anaY: 0.5, anaSpeed: WALK_SPEED });
    expect(half.y).toBeCloseTo(WALK_SPEED / 2, 10);
    expect(walkVector({ anaY: 1, anaSpeed: WALK_SPEED }).y).toBeCloseTo(WALK_SPEED, 10);
  });

  it('reaches JOG_SPEED at full deflection when the source reports jog', () => {
    const v = walkVector({ anaX: 0.8, anaY: 0.6, anaSpeed: JOG_SPEED, maxSpeed: JOG_SPEED });
    expect(speed(v)).toBeCloseTo(JOG_SPEED, 10);
  });

  it('caps a keyboard plus analogue sum at JOG_SPEED', () => {
    for (const keySpeed of [WALK_SPEED, JOG_SPEED]) {
      const v = walkVector({ keyY: 1, keySpeed, anaY: 1, anaSpeed: JOG_SPEED, maxSpeed: JOG_SPEED });
      expect(speed(v)).toBeCloseTo(JOG_SPEED, 10);
    }
  });

  it('never lets two analogue sources add past 1 before the speed is applied', () => {
    const v = walkVector({ anaX: 1, anaY: 1, anaSpeed: JOG_SPEED, maxSpeed: JOG_SPEED });
    expect(speed(v)).toBeCloseTo(JOG_SPEED, 10);
  });

  it('never exceeds the jog speed in hazards.json', () => {
    const hazardJog = hazards.values['mobility.speed.jog'].value;
    const v = walkVector({ keyX: 1, keyY: 1, keySpeed: JOG_SPEED, anaX: 1, anaY: 1, anaSpeed: JOG_SPEED, maxSpeed: JOG_SPEED });
    expect(speed(v)).toBeLessThanOrEqual(hazardJog + 1e-9);
  });

  it('does not cap a keyboard-only diagonal, so the keyboard is unchanged', () => {
    const v = walkVector({ keyX: -1, keyY: 1, keySpeed: JOG_SPEED, maxSpeed: JOG_SPEED });
    expect(speed(v)).toBeGreaterThan(JOG_SPEED);
  });

  it('returns a zero vector with no input and survives odd values', () => {
    expect(walkVector()).toEqual({ x: 0, y: 0 });
    expect(walkVector({ keyX: NaN, keyY: 'up', keySpeed: Infinity, anaX: null, anaSpeed: undefined })).toEqual({ x: 0, y: 0 });
  });
});
