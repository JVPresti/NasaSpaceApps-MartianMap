import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findLabel, findSources, findWaypointName, insertFindWaypoint, priceDetour, rankInsertions } from './findDetour.js';
import { legCostSources } from './legCosts.js';
import { suitConstantsFromHazards } from './suitModel.js';

const readJson = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + p, import.meta.url)), 'utf8'));
const hazards = readJson('public/data/hazards.json');
const c = suitConstantsFromHazards(hazards);
const CELL = 2;

/** Flat grid centred on the origin, like terrain.json: n nodes per side, 2 m apart. */
function flatGrid(n, isBlocked = () => false) {
  const count = n * n, cost = new Float32Array(count).fill(1), blocked = new Uint8Array(count);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) if (isBlocked(i, j)) { blocked[j * n + i] = 1; cost[j * n + i] = Infinity; }
  const width = (n - 1) * CELL;
  return { n, width, depth: width, cellSizeX: CELL, cellSizeZ: CELL, heights: new Float32Array(count), slopes: new Float32Array(count), cost, blocked, baseCost: cost.slice(), baseBlocked: blocked.slice(), density: new Uint8Array([0, 0, 0, 0]), densityN: 2 };
}

const grid = flatGrid(301);   // 600 m square, x and z from -300 to 300
const route = { waypoints: [{ name: 'HAB', x: -250, z: 0 }, { name: 'WP1', x: 0, z: 0 }, { name: 'WP2', x: 250, z: 0 }], nextIndex: 1 };
const position = { x: -200, z: 0 };
// a fresh suit standing still: the HUD numbers at the start of the EVA (O2 rate at rest, margin about 4 h)
const suit = { oxygenG: c.o2UsableG, oxygenSec: c.o2UsableG / 0.0045, marginSec: 4 * 3600 };

describe('detour cost', () => {
  it('is close to zero for a find next to the route', () => {
    const r = priceDetour(grid, { ...route, position, find: { x: -100, z: 2 }, constants: c, suit });
    expect(r.ok).toBe(true);
    expect(r.extraSec).toBeLessThan(10);
    expect(r.extraM).toBeLessThan(6);
    expect(r.insertIndex).toBe(1);   // go there first, then the current target WP1
    expect(r.verdict).toBe('go');
    expect(r.marginBeforeSec - r.marginAfterSec).toBeLessThan(60);
  });

  it('grows with distance from the route', () => {
    const near = priceDetour(grid, { ...route, position, find: { x: -100, z: 20 }, constants: c, suit });
    const far = priceDetour(grid, { ...route, position, find: { x: -100, z: 200 }, constants: c, suit });
    expect(far.extraSec).toBeGreaterThan(near.extraSec + 200);
    expect(far.extraO2G).toBeGreaterThan(near.extraO2G);
    expect(far.marginAfterSec).toBeLessThan(near.marginAfterSec);
  });

  it('flips to no-go when the margin after falls to the reserve', () => {
    const lowSuit = { ...suit, marginSec: 5 * 60 };   // 5 min over the reserve
    const near = priceDetour(grid, { ...route, position, find: { x: -100, z: 2 }, constants: c, suit: lowSuit });
    const far = priceDetour(grid, { ...route, position, find: { x: -100, z: 250 }, constants: c, suit: lowSuit });
    expect(near.verdict).toBe('go');
    expect(far.verdict).toBe('no-go');
    expect(far.reason).toBe('margin');
    expect(far.marginAfterSec).toBeLessThanOrEqual(c.warningSec);
  });

  it('is no-go for a find in a blocked cell, but still says what reaching its edge costs', () => {
    // a 20 m square of ground over the slope limit around (100, 100)
    const steep = flatGrid(301, (i, j) => Math.abs(i * CELL - 300 - 100) <= 10 && Math.abs(j * CELL - 300 - 100) <= 10);
    const r = priceDetour(steep, { ...route, position, find: { x: 100, z: 100 }, constants: c, suit });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe('no-go');
    expect(r.reason).toBe('blocked');
    expect(r.ok).toBe(true);
    expect(r.extraSec).toBeGreaterThan(0);
  });

  it('is unknown, not go, before the suit model has a margin', () => {
    const r = priceDetour(grid, { ...route, position, find: { x: -100, z: 2 }, constants: c, suit: null });
    expect(r.verdict).toBe('unknown');
    expect(r.marginAfterSec).toBeNull();
  });

  it('rejoins after the current target when the find lies along the next leg', () => {
    const r = priceDetour(grid, { ...route, position, find: { x: 125, z: 3 }, constants: c, suit });
    expect(r.insertIndex).toBe(2);   // HAB, WP1, find, WP2
    expect(r.extraSec).toBeLessThan(10);
  });

  it('goes there and back when the route has no waypoint left', () => {
    const r = priceDetour(grid, { waypoints: route.waypoints, nextIndex: 3, position: { x: 250, z: 0 }, find: { x: 250, z: 40 }, constants: c, suit });
    expect(r.insertIndex).toBe(3);
    expect(r.extraM).toBeGreaterThan(78);
    expect(r.extraM).toBeLessThan(84);
  });
});

describe('ranking insertion points', () => {
  it('puts the leg the find sits beside first', () => {
    const chain = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }];
    expect(rankInsertions(chain, { x: 150, z: 5 })[0].k).toBe(1);
    expect(rankInsertions(chain, { x: 50, z: 5 })[0].k).toBe(0);
  });
});

describe('accepting a find', () => {
  const find = { name: findWaypointName(findLabel(1)), x: 125, z: 3, find: 'M01' };

  it('inserts the waypoint after the current target', () => {
    const list = insertFindWaypoint(route.waypoints, find, 2, route.nextIndex);
    expect(list.map((w) => w.name)).toEqual(['HAB', 'WP1', 'M01 · find', 'WP2']);
    expect(list[route.nextIndex].name).toBe('WP1');   // nextIndex still points at the current target
  });

  it('never inserts before a waypoint already reached', () => {
    const list = insertFindWaypoint(route.waypoints, find, 0, 2);
    expect(list.map((w) => w.name)).toEqual(['HAB', 'WP1', 'M01 · find', 'WP2']);
  });

  it('labels finds M01, M02 and names the waypoint with a short name', () => {
    expect(findLabel(1)).toBe('M01');
    expect(findLabel(12)).toBe('M12');
    expect(findWaypointName('M03')).toBe('M03 · find');
  });
});

describe('sources', () => {
  it('uses the leg tags for time and O2 and the HUD margin tag for the margins', () => {
    const s = findSources(hazards, c);
    expect(s['finds.extraSec'].tag).toBe(legCostSources(hazards)['route.legs.timeSec'].tag);
    expect(s['finds.extraO2G'].tag).toBe(legCostSources(hazards)['route.legs.o2G'].tag);
    expect(s['finds.marginAfterSec'].tag).toBe(c.sources['suit.marginSec'].tag);
    expect(s['finds.verdict'].tag).toBe(c.sources['suit.marginSec'].tag);
  });
});
