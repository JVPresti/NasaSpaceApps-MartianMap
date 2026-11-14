import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, isBlockedAt } from './costGrid.js';
import { DEFAULT_HABITAT, habitatFromRoute, replanToNearestShelter } from './replan.js';

const CELL = 2;

/**
 * Flat synthetic grid with optional blocked cells and a cost function.
 * @param {number} n
 * @param {{blocked?: (i: number, j: number) => boolean,
 *   cost?: (i: number, j: number) => number}} [options]
 */
function flatGrid(n, options = {}) {
  const isBlocked = options.blocked ?? (() => false);
  const costFor = options.cost ?? (() => 1);
  const count = n * n;
  const cost = new Float32Array(count);
  const blocked = new Uint8Array(count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const index = j * n + i;
      if (isBlocked(i, j)) {
        blocked[index] = 1;
        cost[index] = Infinity;
      } else {
        cost[index] = costFor(i, j);
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

describe('shelter choice', () => {
  // A is closer in a straight line but sits inside expensive ground.
  const grid = flatGrid(101, {
    cost: (i, j) => {
      const x = (i / 100 - 0.5) * 200;
      const z = (j / 100 - 0.5) * 200;
      return Math.abs(x) < 20 && z > 15 && z < 45 ? 20 : 1;
    },
  });

  it('picks the cheaper route, not the closest shelter', () => {
    const result = replanToNearestShelter(grid, { x: 0, z: 0 }, [
      { id: 'A', x: 0, z: 30 },
      { id: 'B', x: 60, z: 0 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.target.id).toBe('B');
    expect(result.alternatives.find((a) => a.shelter.id === 'A').cost).toBeGreaterThan(
      result.alternatives.find((a) => a.shelter.id === 'B').cost,
    );
  });
});

describe('event zones', () => {
  const grid = flatGrid(101);

  it('plans around a blocked zone on a copy of the grid', () => {
    const result = replanToNearestShelter(
      grid,
      { x: 0, z: 0 },
      [{ id: 'shelter', x: 60, z: 0 }],
      {
        reason: 'dust storm',
        zones: [{ id: 'storm', x: 30, z: 0, radius: 10, blocked: true }],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.gridModified).toBe(true);
    expect(result.zoneCells).toBeGreaterThan(0);
    expect(result.reason).toBe('dust storm');
    expect(result.distance).toBeGreaterThan(60);
    for (const [x, z] of result.path) {
      expect(isBlockedAt(grid, x, z)).toBe(false);
    }
    // The base grid is untouched.
    expect(isBlockedAt(grid, 30, 0)).toBe(false);
  });

  it('reports when no shelter can be reached', () => {
    const walled = flatGrid(101, { blocked: (i) => i === 50 });
    const result = replanToNearestShelter(walled, { x: -50, z: 0 }, [
      { id: 'east', x: 50, z: 0 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.target).toBeNull();
    expect(result.alternatives[0].ok).toBe(false);
    expect(result.detail).toMatch(/no shelter/);
  });
});

describe('habitat as the default shelter', () => {
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
  const habitat = habitatFromRoute(routeJson);

  it('reads HAB from route.json', () => {
    expect(habitat).toEqual({ id: 'HAB', name: 'HAB', x: 520, z: 600 });
    expect(DEFAULT_HABITAT).toMatchObject({ id: 'HAB', x: 520, z: 600 });
  });

  it('re-plans from Cheyava Falls to the habitat', () => {
    const result = replanToNearestShelter(grid, { x: 0, z: 0 }, [habitat], {
      reason: 'low oxygen',
    });

    expect(result.ok).toBe(true);
    expect(result.target.id).toBe('HAB');
    expect(result.reason).toBe('low oxygen');
    expect(result.path[0]).toEqual([0, 0]);
    expect(result.path[result.path.length - 1]).toEqual([520, 600]);
  });

  it('re-plans from any position on the tile in under 100 ms', () => {
    const positions = [
      [0, 0],
      [300, -200],
      [-400, 400],
      [-300, -300],
      [520, 600],
    ];

    for (const [x, z] of positions) {
      // Warm up the JIT and the search buffers for this starting point.
      replanToNearestShelter(grid, { x, z }, [habitat]);
      let best = Infinity;
      let result = null;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        result = replanToNearestShelter(grid, { x, z }, [habitat]);
        best = Math.min(best, performance.now() - started);
      }
      expect(result.ok).toBe(true);
      expect(best).toBeLessThan(100);
      for (const [px, pz] of result.path) {
        expect(isBlockedAt(grid, px, pz)).toBe(false);
      }
    }
  });

  it('returns a one-point route when already at the shelter', () => {
    const result = replanToNearestShelter(grid, { x: 520, z: 600 }, [habitat], {
      reason: 'already safe',
    });
    expect(result.ok).toBe(true);
    expect(result.path).toEqual([[520, 600]]);
    expect(result.distance).toBe(0);
  });
});
