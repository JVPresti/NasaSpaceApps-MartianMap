import { describe, expect, it } from 'vitest';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { needsRecenter, slopeClass, snapCenter, RECENTER_M } from './slopeGridRules.js';

describe('slope grid rules', () => {
  it('colours by the route planner limits, like the slope layer', () => {
    expect(slopeClass(5)).toBe('ok');
    expect(slopeClass(COST_CONSTANTS.SLOPE_CAUTION_DEG + 0.1)).toBe('caution');
    expect(slopeClass(COST_CONSTANTS.SLOPE_LIMIT_DEG + 0.1)).toBe('nogo');
  });
  it('snaps the patch to the grid so the lines stay put on the ground', () => {
    expect(snapCenter(9.1, -6.2)).toEqual({ x: 8, z: -8 });
  });
  it('moves the patch only after the player walks away from its centre', () => {
    const c = { x: 0, z: 0 };
    expect(needsRecenter(null, 0, 0)).toBe(true);
    expect(needsRecenter(c, RECENTER_M - 0.1, 0)).toBe(false);
    expect(needsRecenter(c, 0, -RECENTER_M)).toBe(true);
  });
});
