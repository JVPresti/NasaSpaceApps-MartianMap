import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, isBlockedAt } from './costGrid.js';
import { planRoute } from './routePlanner.js';
import { checkTaskPoint, NEAR_PLACE_M, reachableFrom, ROCK_COVER_LOW, rockCover, SNAP_M } from './taskPlace.js';

// A small grid in the planner's shape: 21 x 21 nodes 2 m apart over 40 m, x and z from -20 to 20 m.
function grid({ blocked = [], density = new Uint8Array(16).fill(255) } = {}) {
  const n = 21;
  const cells = new Uint8Array(n * n);
  const slopes = new Float32Array(n * n).fill(5);
  for (const [i, j] of blocked) {
    cells[j * n + i] = 1;
    slopes[j * n + i] = 30;
  }
  return { n, width: 40, depth: 40, blocked: cells, baseBlocked: cells.slice(), slopes, density, densityN: 4 };
}
const at = (i) => (i / 20 - 0.5) * 40;   // node index to metres
const square = (i0, i1, j0, j1) => {
  const out = [];
  for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) out.push([i, j]);
  return out;
};
const wall = square(14, 14, 0, 20);   // a blocked column at x = 8 m: everything east of it is out of reach
const start = { x: at(2), z: at(10) };

describe('reachableFrom', () => {
  it('joins the cells the planner can walk to from the start, and not those past a blocked band', () => {
    const g = grid({ blocked: wall });
    const reach = reachableFrom(g, start);
    expect(reach[10 * 21 + 13]).toBe(1);
    expect(reach[10 * 21 + 15]).toBe(0);
    expect(reach.reduce((sum, v) => sum + v, 0)).toBe(14 * 21);
    expect(reachableFrom(g, start)).toBe(reach);   // cached per grid and start
  });

  it('never cuts a diagonal between two blocked orthogonal cells, as the A* search', () => {
    const g = grid({ blocked: [[1, 0], [0, 1]] });
    const reach = reachableFrom(g, { x: at(0), z: at(0) });
    expect(reach.reduce((sum, v) => sum + v, 0)).toBe(1);
    expect(reach[1 * 21 + 1]).toBe(0);
  });

  it('starts from the nearest walkable cell when the start is on blocked ground, as planRoute snaps a start', () => {
    const g = grid({ blocked: square(0, 3, 9, 11) });
    expect(reachableFrom(g, { x: at(1), z: at(10) })[10 * 21 + 10]).toBe(1);
  });

  it('reads the base grid, so an event zone on the grid does not change it', () => {
    const g = grid({ blocked: wall });
    g.blocked.fill(1);
    expect(reachableFrom(g, start)[10 * 21 + 10]).toBe(1);
  });
});

describe('checkTaskPoint', () => {
  const g = grid({ blocked: [...wall, ...square(3, 7, 15, 19)] });

  it('refuses a click outside the tile or within 2 m of its edge', () => {
    expect(checkTaskPoint(g, { x: 19, z: 0 }, { start })).toEqual({ ok: false, reason: 'off-map', slopeDeg: null });
    expect(checkTaskPoint(g, { x: 0, z: -25 }, { start })).toMatchObject({ ok: false, reason: 'off-map' });
    expect(checkTaskPoint(g, { x: NaN, z: 0 }, { start })).toMatchObject({ ok: false, reason: 'off-map' });
  });

  it('places a new point where the crew clicked on walkable ground it can reach, with no id', () => {
    expect(checkTaskPoint(g, { x: 1.234, z: -3.456 }, { start })).toEqual({ ok: true, place: { type: 'point', x: 1.23, z: -3.46 }, snappedM: 0, slopeDeg: 5 });
  });

  it('takes a known stop or an existing point within 8 m, the nearest of them', () => {
    const stops = [{ id: 'bright-angel', x: 0, z: 0 }];
    const points = [{ id: 'P1', x: 6, z: 0 }];
    expect(checkTaskPoint(g, { x: 2, z: 0 }, { start, stops, points })).toMatchObject({ ok: true, place: { type: 'stop', stopId: 'bright-angel' }, snappedM: 2 });
    expect(checkTaskPoint(g, { x: 5, z: 0 }, { start, stops, points })).toEqual({ ok: true, place: { type: 'point', id: 'P1', x: 6, z: 0 }, snappedM: 1, slopeDeg: 5 });
    expect(checkTaskPoint(g, { x: 0, z: NEAR_PLACE_M + 0.5 }, { start, stops })).toMatchObject({ ok: true, place: { type: 'point' } });
  });

  it('moves a click on ground over 20 degrees to walkable ground within 4 m, else refuses it as steep', () => {
    // the blocked patch spans x -14 to -6 m, z 10 to 18 m: its edge is 2 m from walkable ground, its middle 6 m
    expect(checkTaskPoint(g, { x: at(3), z: at(17) }, { start })).toEqual({ ok: true, place: { type: 'point', x: at(2), z: at(17) }, snappedM: 2, slopeDeg: 5 });
    expect(checkTaskPoint(g, { x: at(5), z: at(17) }, { start })).toEqual({ ok: false, reason: 'steep', slopeDeg: 30 });
    expect(SNAP_M).toBe(4);
  });

  it('refuses a point the airlock cannot reach', () => {
    expect(checkTaskPoint(g, { x: at(17), z: 0 }, { start })).toEqual({ ok: false, reason: 'unreachable', slopeDeg: 5 });
  });
});

describe('rockCover', () => {
  // 4 x 4 density cells of 10 m: the north-west quarter bare (0.08), the rest rocky (1)
  const density = new Uint8Array(16).fill(255);
  for (const k of [0, 1, 4, 5]) density[k] = 0;
  const g = grid({ density });

  it('averages the rock abundance of the cells within the radius, at least the cell under the point', () => {
    expect(rockCover(g, { x: -15, z: -15 }, 0)).toEqual({ mean: 0.08, low: true });
    expect(rockCover(g, { x: 15, z: 15 }, 2)).toEqual({ mean: 1, low: false });
    // the corner of four cells: two bare, two rocky (centres 7.1 m away)
    const mixed = rockCover(g, { x: 0, z: -10 }, 8);
    expect(mixed.mean).toBeCloseTo((0.08 + 0.08 + 1 + 1) / 4, 6);
    expect(mixed.low).toBe(false);
    expect(ROCK_COVER_LOW).toBe(0.2);
  });
});

describe('on the real terrain', () => {
  const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8'));
  const real = buildCostGrid(readJson('public/marswalk/assets/terrain.json'));
  const airlock = { x: 535.1, z: 574.1 };

  it('reaches most of the tile from the airlock, and the planner finds a route to an accepted point', () => {
    const reach = reachableFrom(real, airlock);
    const share = reach.reduce((sum, v) => sum + v, 0) / reach.length;
    expect(share).toBeGreaterThan(0.8);
    const result = checkTaskPoint(real, { x: 560, z: 574 }, { start: airlock });
    expect(result).toMatchObject({ ok: true, place: { type: 'point', x: 560, z: 574 }, snappedM: 0 });
    expect(planRoute(real, [airlock, result.place]).ok).toBe(true);
  });

  it('refuses the middle of a steep slope and a pocket of walkable ground the airlock cannot reach', () => {
    expect(isBlockedAt(real, -652.46, -718)).toBe(true);
    expect(checkTaskPoint(real, { x: -652.46, z: -718 }, { start: airlock })).toMatchObject({ ok: false, reason: 'steep' });
    expect(isBlockedAt(real, 464.69, -650)).toBe(false);
    expect(checkTaskPoint(real, { x: 464.69, z: -650 }, { start: airlock })).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('finds little rock cover in about the lowest fifth of the tile, and enough at the known stops', () => {
    const n = real.densityN;
    let low = 0;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (rockCover(real, { x: ((c + 0.5) / n - 0.5) * real.width, z: ((r + 0.5) / n - 0.5) * real.depth }, 0).low) low += 1;
      }
    }
    expect(low / (n * n)).toBeGreaterThan(0.15);
    expect(low / (n * n)).toBeLessThan(0.25);
    expect(rockCover(real, { x: 493, z: 539 }, 10).low).toBe(false);   // the light-toned patch of the first sortie
    expect(rockCover(real, { x: -11, z: -50 }, 4).low).toBe(false);    // Bright Angel
    expect(rockCover(real, { x: 445, z: 424 }, 10).low).toBe(true);    // bare ground 180 m north-west of the airlock
  });
});
