import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, COST_CONSTANTS, slopeAt } from './costGrid.js';
import {
  SLOPE_NO_GO_DEG,
  detourExtra,
  lookAhead,
  noGoCells,
} from './slopeAhead.js';

const flat = () => 0;
const steep = () => 30;

describe('slope limit', () => {
  it('matches the cost grid and the slope layer', () => {
    expect(SLOPE_NO_GO_DEG).toBe(COST_CONSTANTS.SLOPE_LIMIT_DEG);
    expect(SLOPE_NO_GO_DEG).toBe(20);
  });
});

describe('slope look-ahead', () => {
  it('does not warn on flat ground', () => {
    const result = lookAhead({ x: 0, z: 0 }, 0, flat);
    expect(result.blocked).toBe(false);
    expect(result.maxSlopeDeg).toBe(0);
    expect(result.distanceM).toBeNull();
  });

  it('warns before a steep cell and reports its distance', () => {
    const result = lookAhead({ x: 0, z: 0 }, 0, steep);
    expect(result.blocked).toBe(true);
    expect(result.maxSlopeDeg).toBe(30);
    expect(result.distanceM).toBe(2);
  });

  it('sees a ridge 12 m ahead', () => {
    const ridge = (_x, z) => (z < -10 ? 32 : 0);
    const result = lookAhead({ x: 0, z: 0 }, 0, ridge);
    expect(result.blocked).toBe(true);
    expect(result.distanceM).toBe(12);
  });

  it('clears when the astronaut turns away', () => {
    const ridge = (_x, z) => (z < -4 ? 32 : 0);
    expect(lookAhead({ x: 0, z: 0 }, 0, ridge).blocked).toBe(true);
    expect(lookAhead({ x: 0, z: 0 }, 90, ridge).blocked).toBe(false);
  });

  it('warns at the real 34 degree spot west of Cheyava Falls', () => {
    const terrain = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../public/marswalk/assets/terrain.json', import.meta.url)),
        'utf8',
      ),
    );
    const grid = buildCostGrid(terrain);
    const result = lookAhead({ x: -201, z: -32 }, 0, (x, z) => slopeAt(grid, x, z));
    expect(result.blocked).toBe(true);
    expect(result.maxSlopeDeg).toBeGreaterThan(COST_CONSTANTS.SLOPE_LIMIT_DEG);
  });
});

describe('no-go cells', () => {
  it('returns only the cells over the limit', () => {
    const cells = noGoCells({ x: 0, z: 0 }, (x) => (x > 0 ? 30 : 5), {
      radiusM: 6,
      cellM: 3,
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.slopeDeg > SLOPE_NO_GO_DEG)).toBe(true);
    expect(cells.some((cell) => cell.x <= 0)).toBe(false);
  });

  it('snaps cells to the world grid so the patch does not slide', () => {
    const slope = (x) => (x > 0 ? 30 : 5);
    const a = noGoCells({ x: 0.4, z: 0.4 }, slope, { radiusM: 6, cellM: 3 });
    const b = noGoCells({ x: 0.6, z: 0.6 }, slope, { radiusM: 6, cellM: 3 });
    expect(a).toEqual(b);
    expect(a.every((cell) => (cell.x - 1.5) % 3 === 0 && (cell.z - 1.5) % 3 === 0)).toBe(true);
  });

  it('returns an empty array without a position', () => {
    expect(noGoCells(null, steep)).toEqual([]);
  });
});

describe('detour cost', () => {
  it('reports the extra distance and time', () => {
    expect(detourExtra({ distance: 130 }, 100, 1)).toEqual({ addedM: 30, addedSec: 30 });
    expect(detourExtra({ distance: 90 }, 100, 1)).toEqual({ addedM: 0, addedSec: 0 });
  });
});
