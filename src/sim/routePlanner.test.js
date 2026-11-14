import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, isBlockedAt } from './costGrid.js';
import { isSegmentClear, measurePath, planRoute, smoothPath } from './routePlanner.js';

const CELL = 2;

/**
 * Flat synthetic grid with an optional blocked predicate.
 * @param {number} n nodes per side
 * @param {(i: number, j: number) => boolean} [isBlocked]
 */
function flatGrid(n, isBlocked = () => false) {
  const count = n * n;
  const cost = new Float32Array(count).fill(1);
  const blocked = new Uint8Array(count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      if (isBlocked(i, j)) {
        blocked[j * n + i] = 1;
        cost[j * n + i] = Infinity;
      }
    }
  }
  const width = (n - 1) * CELL;
  return {
    n,
    width,
    depth: width,
    cellSizeX: CELL,
    cellSizeZ: CELL,
    heights: new Float32Array(count),
    slopes: new Float32Array(count),
    cost,
    blocked,
    baseCost: cost.slice(),
    baseBlocked: blocked.slice(),
    density: new Uint8Array([255, 255, 255, 255]),
    densityN: 2,
  };
}

function assertPathIsOpen(grid, path) {
  for (const [x, z] of path) {
    expect(isBlockedAt(grid, x, z)).toBe(false);
  }
}

describe('straight route on flat ground', () => {
  const grid = flatGrid(101);

  it('returns the endpoints and the expected distance', () => {
    const result = planRoute(grid, [[-80, 0], [80, 0]]);
    expect(result.ok).toBe(true);
    expect(result.path[0]).toEqual([-80, 0]);
    expect(result.path[result.path.length - 1]).toEqual([80, 0]);
    expect(result.distance).toBeCloseTo(160, 0);
    expect(result.climb).toBe(0);
    expect(result.steepestSlopeDeg).toBe(0);
    assertPathIsOpen(grid, result.path);
  });

  it('returns the path in the [x, z] format route.json accepts', () => {
    const result = planRoute(grid, [[-20, -20], [20, 20]]);
    for (const point of result.path) {
      expect(point).toHaveLength(2);
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
    }
  });
});

describe('detour around a blocked band', () => {
  // A wall from the north edge down to row 60, leaving a gap in the south.
  const grid = flatGrid(101, (i, j) => i === 50 && j <= 60);

  it('goes around the end of the wall and never crosses it', () => {
    const result = planRoute(grid, [[-80, 0], [80, 0]]);
    expect(result.ok).toBe(true);
    expect(result.distance).toBeGreaterThan(160);
    expect(result.path.some(([, z]) => z > 10)).toBe(true);
    assertPathIsOpen(grid, result.path);
  });

  it('fails cleanly when the wall closes the whole map', () => {
    const closed = flatGrid(101, (i) => i === 50);
    const result = planRoute(closed, [[-80, 0], [80, 0]]);
    expect(result.ok).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.reason).toMatch(/no path/);
    expect(result.failedSegment).toBe(0);
  });
});

describe('smoothing', () => {
  const grid = flatGrid(101);

  it('collapses a cell-by-cell staircase on open ground', () => {
    const staircase = [[-10, -10], [-8, -8], [-6, -6], [-4, -4], [-2, -2]];
    expect(smoothPath(grid, staircase)).toEqual([[-10, -10], [-2, -2]]);
  });

  it('keeps a vertex when the shortcut would cross blocked ground', () => {
    const wallGrid = flatGrid(101, (i) => i === 50);
    const around = [[-4, 0], [0, 30], [4, 0]];
    expect(
      isSegmentClear(wallGrid, { x: around[0][0], z: around[0][1] }, {
        x: around[2][0],
        z: around[2][1],
      }),
    ).toBe(false);
    expect(smoothPath(wallGrid, around)).toEqual(around);
  });
});

describe('the five waypoints in route.json', () => {
  const terrainJson = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../public/marswalk/assets/terrain.json', import.meta.url)),
      'utf8',
    ),
  );
  const routeJson = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../public/marswalk/assets/route.json', import.meta.url)),
      'utf8',
    ),
  );
  const grid = buildCostGrid(terrainJson);

  it('plans the full route quickly and stays off blocked cells', () => {
    const started = performance.now();
    const result = planRoute(grid, routeJson.waypoints);
    const elapsed = performance.now() - started;

    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(500);
    expect(result.path.length).toBeGreaterThan(1);
    expect(result.path[0]).toEqual([routeJson.waypoints[0].x, routeJson.waypoints[0].z]);
    expect(result.path[result.path.length - 1]).toEqual([
      routeJson.waypoints[routeJson.waypoints.length - 1].x,
      routeJson.waypoints[routeJson.waypoints.length - 1].z,
    ]);
    assertPathIsOpen(grid, result.path);
    // path points are rounded to 1 mm, so the re-measured length drifts by a few mm
    expect(measurePath(grid, result.path).distance).toBeCloseTo(result.distance, 2);
  });

  it('reaches every waypoint, or its walkable edge for the outcrop', () => {
    const result = planRoute(grid, routeJson.waypoints);
    const nearest = routeJson.waypoints.map((waypoint) =>
      Math.min(...result.path.map(([x, z]) => Math.hypot(x - waypoint.x, z - waypoint.z))),
    );
    // WP3 is the Bright Angel outcrop, too steep to stand on: the route stops
    // at the walkable edge within the 20 m goal radius.
    for (const distance of nearest) {
      expect(distance).toBeLessThanOrEqual(20);
    }
  });
});
