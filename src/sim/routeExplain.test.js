import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, cellCost, traverseMask } from './costGrid.js';
import { BEND_MIN_M, explainLeg, explainRoute } from './routeExplain.js';
import { planRoute } from './routePlanner.js';
import { suitConstantsFromHazards } from './suitModel.js';

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8'));
const constants = suitConstantsFromHazards(readJson('public/data/hazards.json'));
const CELL = 2;

/**
 * Flat synthetic grid, 2 m cells. `slope(i, j)` sets the slope of a node (over 20 degrees is closed) and `rock(i, j)`
 * the rock abundance (0.08 to 1) through a full-resolution density map.
 */
function grid(n, { slope = () => 0, rock = () => 0.08 } = {}) {
  const count = n * n;
  const slopes = new Float32Array(count);
  const blocked = new Uint8Array(count);
  const cost = new Float32Array(count);
  const density = new Uint8Array(count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      slopes[k] = slope(i, j);
      // inverse of rockAbundanceAt's remap, so rockAbundanceAt reads back rock(i, j)
      density[k] = Math.round(255 * (0.25 + ((rock(i, j) - 0.08) / 0.92) * 0.55));
    }
  }
  const width = (n - 1) * CELL;
  const g = {
    n, width, depth: width, cellSizeX: CELL, cellSizeZ: CELL,
    heights: new Float32Array(count), slopes, cost, blocked, density, densityN: n,
  };
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      blocked[k] = slopes[k] > 20 ? 1 : 0;
      cost[k] = blocked[k] ? Infinity : cellCost(slopes[k], rockOf(g, i, j));
    }
  }
  g.baseCost = cost.slice();
  g.baseBlocked = blocked.slice();
  return g;
}

function rockOf(g, i, j) {
  const value = g.density[j * g.n + i] / 255;
  return Math.max(0.08, Math.min(1, 0.08 + ((value - 0.25) / 0.55) * 0.92));
}

// The synthetic grids have no slope in their heights; slopeAt reads the heights, so the explanation gets its slope
// from the planner's own closed cells, and the steep test below sets real heights.
describe('a leg whose straight line is open', () => {
  const g = grid(101);

  it('says the line is clear and costs nothing extra', () => {
    const route = planRoute(g, [[-80, 0], [80, 0]]);
    const [leg] = explainRoute(g, route.path, [{ name: 'A', x: -80, z: 0 }, { name: 'B', x: 80, z: 0 }], { constants });
    expect(leg).toMatchObject({ from: 'A', to: 'B', clear: true, block: null, extraSec: 0, overLimitM: 0 });
    expect(leg.extraM).toBeLessThan(BEND_MIN_M);
    expect(leg.straightM).toBeCloseTo(160, 6);
  });
});

describe('a leg that crosses ground over 20 degrees (#246)', () => {
  // A wall of 30 degree cells from the north edge down to row 70, with a gap in the south.
  const g = grid(101, { slope: (i, j) => (i === 50 && j <= 70 ? 30 : 0) });
  const waypoints = [{ name: 'A', x: -80, z: 0 }, { name: 'B', x: 80, z: 0 }];
  const route = planRoute(g, waypoints);
  const [leg] = explainRoute(g, route.path, waypoints, { constants });

  it('reports a slope block with the metres of the line over the limit', () => {
    expect(leg.clear).toBe(false);
    expect(leg.block).toBe('slope');
    expect(leg.overLimitM).toBeGreaterThan(0);
    expect(leg.overLimitM).toBeLessThan(6);
  });

  it('prices the detour around the wall in metres and seconds', () => {
    expect(leg.routeM).toBeCloseTo(route.distance, 6);
    expect(leg.extraM).toBeCloseTo(route.distance - 160, 6);
    expect(leg.extraM).toBeGreaterThan(15);   // around the end of the wall at z = 42: 2 x hypot(80, 42) - 160 = 21 m
    // flat ground at 1 m/s: one extra second per extra metre
    expect(leg.extraSec).toBeCloseTo(leg.extraM / constants.speedFlat, 0);
  });
});

describe('a leg the planner bends around soft cost', () => {
  it('names rock when the line crosses a rocky band the route goes around', () => {
    // Rock abundance 1 on a 32 m band across the middle, with a gap in the south from z = 46; nothing is closed.
    const g = grid(101, { rock: (i, j) => (Math.abs(i - 50) <= 8 && j <= 72 ? 1 : 0.08) });
    const waypoints = [{ name: 'A', x: -30, z: 30 }, { name: 'B', x: 30, z: 30 }];
    const route = planRoute(g, waypoints, { smoothing: 'cost' });
    const [leg] = explainRoute(g, route.path, waypoints, { constants });
    expect(leg.overLimitM).toBe(0);
    expect(leg.clear).toBe(false);
    expect(leg.block).toBe('rock');
    expect(leg.rockStraight).toBeGreaterThan(leg.rockRoute);
  });

  it('names the rover ground when a cautious route follows it', () => {
    const g = grid(101);
    const drives = [[[-80, 0], [-40, 40], [40, 40], [80, 0]]];
    const mask = traverseMask(g, drives);
    const leg = explainLeg(g, [[-80, 0], [-40, 40], [40, 40], [80, 0]], { traverseMask: mask, traverseDiscount: 0.5, constants });
    expect(leg.clear).toBe(false);
    expect(leg.block).toBe('traverse');
  });
});

describe('the route.json stops on the real terrain', () => {
  const real = buildCostGrid(readJson('public/marswalk/assets/terrain.json'));
  const waypoints = readJson('public/marswalk/assets/route.json').waypoints;
  const route = planRoute(real, waypoints);
  const legs = explainRoute(real, route.path, waypoints, { constants });

  it('explains one leg per pair of waypoints, in the cost table order', () => {
    expect(legs.map((l) => l.to)).toEqual(waypoints.slice(1).map((w) => w.name));
    for (const leg of legs) {
      expect(leg.clear === (leg.block === null)).toBe(true);
      expect(Number.isFinite(leg.extraM)).toBe(true);
      expect(Number.isFinite(leg.extraSec)).toBe(true);
    }
  });

  it('finds at least one leg the 20 degree limit bends', () => {
    expect(legs.some((l) => l.block === 'slope')).toBe(true);
  });
});
