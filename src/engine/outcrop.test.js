import { describe, expect, it } from 'vitest';
import { OUTCROP, outcropPlacement } from './rocks.js';

// A plane that rises 0.5 m per metre towards the north-east: z is south, so uphill is (+x, -z).
const slope = (x, z) => 100 + 0.5 * (x - z) / Math.SQRT2;
const wp = { name: 'WP3 · Bright Angel outcrop', x: -40, z: -60 };

describe('outcropPlacement', () => {
  it('puts the outcrop uphill of the waypoint, outside the arrival circle', () => {
    const at = outcropPlacement(wp, slope);

    expect(Math.hypot(at.x - wp.x, at.z - wp.z)).toBeCloseTo(OUTCROP.back, 6);
    expect(OUTCROP.back).toBeGreaterThan(2);
    expect(at.ux).toBeCloseTo(Math.SQRT1_2, 6);
    expect(at.uz).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(slope(at.x, at.z)).toBeGreaterThan(slope(wp.x, wp.z));
  });

  it('lays it on the ground plane', () => {
    const at = outcropPlacement(wp, slope);
    const [nx, ny, nz] = at.normal;

    expect(at.y).toBeCloseTo(slope(at.x, at.z), 6);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
    // the normal is perpendicular to the two directions that span the plane: one metre east and one metre south
    const east = slope(1, 0) - slope(0, 0), south = slope(0, 1) - slope(0, 0);
    expect(nx + ny * east).toBeCloseTo(0, 6);
    expect(nz + ny * south).toBeCloseTo(0, 6);
    expect(at.slopeDeg).toBeCloseTo(Math.atan(0.5) * 180 / Math.PI, 4);
  });

  it('turns the buried end of the model uphill', () => {
    const at = outcropPlacement(wp, slope);

    // three.js rotation about y by `yaw` sends the model's +x to (cos yaw, 0, -sin yaw)
    expect(Math.cos(at.yaw)).toBeCloseTo(at.ux, 6);
    expect(-Math.sin(at.yaw)).toBeCloseTo(at.uz, 6);
  });

  it('still gives a level placement on flat ground', () => {
    const at = outcropPlacement(wp, () => 12);

    expect(at.y).toBe(12);
    expect(at.normal[0]).toBeCloseTo(0, 9);
    expect(at.normal[1]).toBeCloseTo(1, 9);
    expect(at.normal[2]).toBeCloseTo(0, 9);
    expect(at.slopeDeg).toBe(0);
    expect(Math.hypot(at.x - wp.x, at.z - wp.z)).toBeCloseTo(OUTCROP.back, 6);
  });
});
