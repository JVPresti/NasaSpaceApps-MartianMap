import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyZone,
  buildCostGrid,
  cloneGrid,
  COST_CONSTANTS,
  decodeTerrain,
  decodeUint16,
  gridToWorld,
  heightAt,
  isBlockedAt,
  nearestCell,
  resetZones,
  rockAbundanceAt,
  slopeAt,
  worldToGrid,
} from './costGrid.js';

const terrainJson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../public/marswalk/assets/terrain.json', import.meta.url)),
    'utf8',
  ),
);

/** Build a tiny terrain object that does not need the real data file. */
function syntheticTerrain() {
  const u16 = new Uint16Array([0, 65535, 32768, 65535]);
  return {
    n: 2,
    width_m: 10,
    depth_m: 20,
    base_elev_m: -100,
    range_m: 100,
    heights_u16_b64: Buffer.from(u16.buffer).toString('base64'),
    density_n: 2,
    density_u8_b64: Buffer.from([0, 64, 128, 255]).toString('base64'),
  };
}

describe('decoding', () => {
  it('decodes little-endian uint16 samples', () => {
    const values = new Uint16Array([0, 1, 32768, 65535]);
    const decoded = decodeUint16(Buffer.from(values.buffer).toString('base64'));
    expect(Array.from(decoded)).toEqual([0, 1, 32768, 65535]);
  });

  it('turns raw heights and density into typed arrays', () => {
    const terrain = decodeTerrain(syntheticTerrain());
    expect(terrain.n).toBe(2);
    expect(terrain.heights).toBeInstanceOf(Float32Array);
    expect(terrain.heights[0]).toBe(0);
    expect(terrain.heights[1]).toBe(100);
    expect(terrain.heights[2]).toBeCloseTo(50, 2);
    expect(terrain.heights[3]).toBe(100);
    expect(Array.from(terrain.density)).toEqual([0, 64, 128, 255]);
  });

  it('rejects a payload of the wrong size', () => {
    const broken = syntheticTerrain();
    broken.heights_u16_b64 = Buffer.from(new Uint16Array([1, 2])).toString('base64');
    expect(() => decodeTerrain(broken)).toThrow(/expected 4 heights/);
  });
});

describe('coordinates and height', () => {
  const grid = buildCostGrid(terrainJson);

  it('maps world positions back to the same point', () => {
    const { fx, fy } = worldToGrid(grid, 120, -300);
    const world = gridToWorld(grid, fx, fy);
    expect(world.x).toBeCloseTo(120, 6);
    expect(world.z).toBeCloseTo(-300, 6);
  });

  it('reads the height at Cheyava Falls', () => {
    expect(heightAt(grid, 0, 0)).toBeCloseTo(39.82, 1);
  });

  it('clamps outside positions to the nearest node', () => {
    expect(nearestCell(grid, -10000, 10000)).toEqual({ i: 0, j: grid.n - 1 });
  });
});

describe('slope and blocking', () => {
  const grid = buildCostGrid(terrainJson);

  it.each([
    ['habitat', 520, 600, 4.0],
    ['channel floor', 330, 300, 4.65],
    ['Cheyava Falls', 0, 0, 17.47],
  ])('matches the engine slope layer at %s', (_name, x, z, expected) => {
    expect(slopeAt(grid, x, z)).toBeCloseTo(expected, 1);
  });

  it('blocks the 34 degree spot named in the assets README', () => {
    expect(isBlockedAt(grid, -201, -52)).toBe(true);
    expect(slopeAt(grid, -201, -52)).toBeGreaterThan(COST_CONSTANTS.SLOPE_LIMIT_DEG);
  });

  it('builds the full grid in well under a second', () => {
    const started = performance.now();
    buildCostGrid(terrainJson);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('run-time zones', () => {
  const grid = buildCostGrid(terrainJson);

  it('blocks a zone and restores the base grid', () => {
    const before = grid.cost[nearestCell(grid, 520, 600).j * grid.n + nearestCell(grid, 520, 600).i];
    expect(isBlockedAt(grid, 520, 600)).toBe(false);

    applyZone(grid, { id: 'event-1', x: 520, z: 600, radius: 10, blocked: true });
    expect(isBlockedAt(grid, 520, 600)).toBe(true);

    resetZones(grid);
    expect(isBlockedAt(grid, 520, 600)).toBe(false);
    const { i, j } = nearestCell(grid, 520, 600);
    expect(grid.cost[j * grid.n + i]).toBeCloseTo(before, 6);
  });

  it('makes a zone more expensive without blocking it', () => {
    const { i, j } = nearestCell(grid, 330, 300);
    const index = j * grid.n + i;
    const before = grid.cost[index];
    applyZone(grid, { x: 330, z: 300, radius: 12, costMultiplier: 3 });
    expect(grid.cost[index]).toBeCloseTo(before * 3, 4);
    expect(grid.blocked[index]).toBe(0);
    resetZones(grid);
  });

  it('keeps the base grid intact when planning on a copy', () => {
    const copy = cloneGrid(grid);
    applyZone(copy, { x: 0, z: 0, radius: 15, blocked: true });
    expect(isBlockedAt(copy, 0, 0)).toBe(true);
    expect(isBlockedAt(grid, 0, 0)).toBe(false);
  });

  it('remaps the brightness map to a rock abundance', () => {
    const value = rockAbundanceAt(grid, 0, 0);
    expect(value).toBeGreaterThanOrEqual(COST_CONSTANTS.ROCK_DENSITY_MIN);
    expect(value).toBeLessThanOrEqual(COST_CONSTANTS.ROCK_DENSITY_MAX);
  });
});
