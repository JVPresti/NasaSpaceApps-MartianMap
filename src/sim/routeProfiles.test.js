import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startAtAirlock } from '../plan/routeStart.js';
import { buildCostGrid, cellCost, heightAt, rockAbundanceAt } from './costGrid.js';
import { routeLegCosts } from './legCosts.js';
import { radioShadowMask } from './radio.js';
import { mastKey, planProfiles, PROFILE_IDS, profileGrid, profileSources, ROUTE_PROFILES, slopeAlongPath, summariseProfiles } from './routeProfiles.js';
import { planRoute } from './routePlanner.js';
import { suitConstantsFromHazards } from './suitModel.js';

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));

describe('route profiles on the route.json stops (#245)', () => {
  const grid = buildCostGrid(readJson('../../public/marswalk/assets/terrain.json'));
  const hazards = readJson('../../public/data/hazards.json');
  const waypoints = startAtAirlock(readJson('../../public/marswalk/assets/route.json').waypoints, readJson('../../public/data/shelters.json'));
  // engine.getHabitatMast() for the habitat the engine places at (541, 582): the mast top, 4.35 m above its floor.
  const mast = { x: 544.86, y: heightAt(grid, 541, 582) + 4.31, z: 581.48 };
  const cache = new Map();
  const planned = planProfiles(grid, waypoints, { mast, cache });
  const profiles = summariseProfiles(planned, waypoints, (x, z) => heightAt(grid, x, z), suitConstantsFromHazards(hazards));

  it('plans a route for every profile', () => {
    expect(Object.keys(planned)).toEqual(PROFILE_IDS);
    for (const id of PROFILE_IDS) expect(profiles[id].ok, id).toBe(true);
  });

  it('keeps the fastest profile on the route the planner gave before', () => {
    expect(planned.fastest.path).toEqual(planRoute(grid, waypoints).path);
  });

  it('gives the gentlest route no steeper a point and less steep ground than the fastest', () => {
    expect(profiles.gentlest.steepestSlopeDeg).toBeLessThanOrEqual(profiles.fastest.steepestSlopeDeg);
    expect(profiles.gentlest.overCautionM).toBeLessThan(profiles.fastest.overCautionM);
  });

  it('keeps the radio route in contact for more of the walk than the fastest', () => {
    expect(profiles.radio.shadowShare).toBeLessThanOrEqual(profiles.fastest.shadowShare);
    expect(profiles.radio.shadowShare).toBeLessThan(profiles.fastest.shadowShare - 0.1);
    expect(profiles.radio.longestShadowM).toBeLessThan(profiles.fastest.longestShadowM);
  });

  it('prices each profile with the same leg-cost code as the route panel', () => {
    const constants = suitConstantsFromHazards(hazards);
    for (const id of PROFILE_IDS) {
      const { totals } = routeLegCosts(profiles[id].path, waypoints, (x, z) => heightAt(grid, x, z), constants);
      expect(profiles[id].timeSec).toBe(totals.timeSec);
      expect(profiles[id].o2G).toBe(totals.o2G);
      expect(profiles[id].distanceM).toBeCloseTo(totals.distanceM, 6);
    }
  });

  it('trades a little more walking for what each profile buys', () => {
    // The route barely moves on this site (#242): no profile costs more than a few minutes.
    for (const id of ['gentlest', 'radio']) {
      expect(profiles[id].timeSec).toBeGreaterThanOrEqual(profiles.fastest.timeSec);
      expect(profiles[id].timeSec - profiles.fastest.timeSec).toBeLessThan(5 * 60);
    }
  });

  it('reuses the cached grids and mask on the next request', () => {
    expect(cache.has('mask:' + mastKey(mast))).toBe(true);
    const started = performance.now();
    const again = planProfiles(grid, waypoints, { mast, cache });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(again.radio.path).toEqual(planned.radio.path);
  });

  it('has no radio route without the habitat mast, and still plans the others', () => {
    const blind = planProfiles(grid, waypoints, { mast: null, cache });
    expect(blind.radio).toEqual({ ok: false, reason: 'no-mast' });
    expect(blind.fastest.ok).toBe(true);
    expect(blind.fastest.shadowShare).toBeNull();
    expect(summariseProfiles(blind, waypoints, (x, z) => heightAt(grid, x, z), suitConstantsFromHazards(hazards)).radio)
      .toEqual({ id: 'radio', ok: false, reason: 'no-mast' });
  });

  it('plans only the profiles asked for', () => {
    expect(Object.keys(planProfiles(grid, waypoints, { mast, cache, only: ['radio'] }))).toEqual(['radio']);
  });

  it('tags the comparison columns like the route panel tags route.totals', () => {
    const sources = profileSources(hazards);
    expect(sources['route.profiles.distanceM'].tag).toBe('DERIVED');
    expect(sources['route.profiles.shadowShare'].tag).toBe('DERIVED');
    expect(sources['route.profiles.timeSec'].tag).toBe('SIM');
    expect(sources['route.profiles.o2G'].tag).toBe('SIM');
    expect(sources['route.profiles.weights'].tag).toBe('SIM');
  });
});

/** Flat synthetic grid, 2 m cells, with the slope of every node given by `slope(i, j)`. */
function syntheticGrid(n, slope = () => 0) {
  const count = n * n;
  const width = (n - 1) * 2;
  const slopes = new Float32Array(count);
  const blocked = new Uint8Array(count);
  const cost = new Float32Array(count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      slopes[k] = slope(i, j);
      blocked[k] = slopes[k] > 20 ? 1 : 0;
      cost[k] = blocked[k] ? Infinity : cellCost(slopes[k], 0.08);
    }
  }
  return {
    n, width, depth: width, cellSizeX: 2, cellSizeZ: 2,
    heights: new Float32Array(count), slopes, cost, blocked, baseCost: cost.slice(), baseBlocked: blocked.slice(),
    density: new Uint8Array([0, 0, 0, 0]), densityN: 2,
  };
}

describe('profile grids', () => {
  const grid = syntheticGrid(11, (i) => i * 2);   // 0 to 20 degrees, west to east

  it('leaves the fastest profile on the base grid', () => {
    expect(profileGrid(grid, ROUTE_PROFILES[0])).toBe(grid);
  });

  it('cubes the slope term for the gentlest profile and keeps blocked cells blocked', () => {
    const gentle = profileGrid(grid, ROUTE_PROFILES.find((p) => p.id === 'gentlest'));
    const rock = rockAbundanceAt(grid, 0, 0);
    expect(gentle.cost[5 * 11 + 9]).toBeCloseTo(1 + (18 / 9) ** 3 + 0.6 * rock, 4);
    expect(gentle.cost[5 * 11 + 9]).toBeGreaterThan(grid.cost[5 * 11 + 9]);
    expect(gentle.cost[5 * 11 + 1]).toBeLessThan(grid.cost[5 * 11 + 1] + 1e-6);   // under 9 degrees the cube is cheaper
    expect(gentle.blocked).toBe(grid.blocked);
  });

  it('triples the cost only in radio shadow for the radio profile', () => {
    const flat = syntheticGrid(11);
    // A mast on the west edge, 0.5 m up, behind a ridge one cell east of it: everything east of the ridge is in shadow.
    flat.heights = new Float32Array(121).map((_, k) => (k % 11 === 2 ? 5 : 0));
    const mask = radioShadowMask(flat, { x: -10, y: 0.5, z: 0 }, 2);
    const radio = profileGrid(flat, ROUTE_PROFILES.find((p) => p.id === 'radio'), mask);
    expect(radio.cost[5 * 11 + 1]).toBeCloseTo(flat.cost[5 * 11 + 1], 6);   // west of the ridge: in sight
    expect(radio.cost[5 * 11 + 8]).toBeCloseTo(3 * flat.cost[5 * 11 + 8], 5);   // behind it: three times
    expect(() => profileGrid(flat, ROUTE_PROFILES.find((p) => p.id === 'radio'))).toThrow(/mask/);
  });
});

describe('slope along a path', () => {
  it('finds a steep band between two path vertices and measures the length on it', () => {
    // 51 nodes, 100 m across; a band over 15 degrees around x = 0, flat elsewhere.
    const n = 51;
    const grid = syntheticGrid(n);
    for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) grid.heights[j * n + i] = Math.abs(i - 25) <= 2 ? (i - 23) * 1.2 : i > 27 ? 6 : 0;
    const { steepestDeg, overCautionM } = slopeAlongPath(grid, [[-40, 0], [40, 0]]);
    expect(steepestDeg).toBeGreaterThan(15);
    expect(overCautionM).toBeGreaterThan(4);
    expect(overCautionM).toBeLessThan(20);
    expect(slopeAlongPath(grid, [[-40, -40], [-30, -40]]).overCautionM).toBe(0);
  });
});
