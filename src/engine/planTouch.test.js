import { describe, expect, it } from 'vitest';
import { planTouches } from './planTouch.js';

// The numbers of three.js THREE.TOUCH, declared here so the test never imports three: ROTATE 0, PAN 1, DOLLY_PAN 2.
const TOUCH = Object.freeze({ ROTATE: 0, PAN: 1, DOLLY_PAN: 2 });

describe('plan touch configuration', () => {
  it('pans with one finger and pans with a pinch with two', () => {
    expect(planTouches(TOUCH)).toEqual({ ONE: 1, TWO: 2 });
  });

  it('reads the values it is given instead of hard-coding the enum', () => {
    expect(planTouches({ ROTATE: 7, PAN: 3, DOLLY_PAN: 4 })).toEqual({ ONE: 3, TWO: 4 });
  });

  it('returns a fresh object on every call', () => {
    expect(planTouches(TOUCH)).not.toBe(planTouches(TOUCH));
  });

  it('copies the numbers and keeps no reference to the input', () => {
    const source = { ROTATE: 0, PAN: 1, DOLLY_PAN: 2 };
    const touches = planTouches(source);
    source.PAN = 9;
    source.DOLLY_PAN = 8;
    expect(touches).toEqual({ ONE: 1, TWO: 2 });
    expect(TOUCH).toEqual({ ROTATE: 0, PAN: 1, DOLLY_PAN: 2 });
  });
});
