import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OUTCROP, outcropPlacement } from './rocks.js';
import { COST_CONSTANTS, buildCostGrid, heightAt, isBlockedAt, slopeAt } from '../sim/costGrid.js';

// A plane that rises 0.5 m per metre towards the north-east: z is south, so uphill is (+x, -z).
const slope = (x, z) => 100 + 0.5 * (x - z) / Math.SQRT2;
const wp = { name: 'WP3 · Bright Angel outcrop', x: -11, z: -50 };

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

describe('the WP3 stance point on the real terrain (#192)', () => {
  const load = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../public/' + path, import.meta.url)), 'utf8'));
  const grid = buildCostGrid(load('marswalk/assets/terrain.json'));
  const ground = (x, z) => heightAt(grid, x, z);
  const stance = load('marswalk/assets/route.json').waypoints.find((w) => w.name.startsWith(OUTCROP.waypoint));
  const stop = load('data/stops.json').stops.find((s) => s.id === 'bright-angel');

  it('stands under the no-go slope limit, and under the caution limit', () => {
    expect(COST_CONSTANTS.SLOPE_LIMIT_DEG).toBe(load('data/hazards.json').values['slope.no_go'].value);
    expect(slopeAt(grid, stance.x, stance.z)).toBeLessThan(COST_CONSTANTS.SLOPE_CAUTION_DEG);
    expect(isBlockedAt(grid, stance.x, stance.z)).toBe(false);
    // the whole 2 m arrival circle is walkable, not just its centre
    for (let a = 0; a < 16; a++) {
      const x = stance.x + 2 * Math.cos(a * Math.PI / 8), z = stance.z + 2 * Math.sin(a * Math.PI / 8);
      expect(slopeAt(grid, x, z)).toBeLessThan(COST_CONSTANTS.SLOPE_LIMIT_DEG);
    }
  });

  it('matches the Bright Angel stop in stops.json', () => {
    expect([stop.x, stop.z]).toEqual([stance.x, stance.z]);
    expect(stop.waypoint).toBe(stance.name);
  });

  it('keeps the outcrop on the steeper slope above it', () => {
    const at = outcropPlacement(stance, ground);

    expect(at.slopeDeg).toBeGreaterThan(slopeAt(grid, stance.x, stance.z) + 5);
    expect(ground(at.x, at.z)).toBeGreaterThan(ground(stance.x, stance.z) + 1);
    expect(Math.hypot(at.x - stance.x, at.z - stance.z)).toBeCloseTo(OUTCROP.back, 6);
  });
});
