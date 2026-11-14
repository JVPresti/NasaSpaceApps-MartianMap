import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHeightQueries, decodeTerrainJson, decodeRingJson } from './queries.js';
import { buildCostGrid, decodeUint16, decodeUint8, heightAt as gridHeightAt } from '../sim/costGrid.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL('../../public/marswalk/assets/' + name, import.meta.url)), 'utf8'));
const terrainJson = load('terrain.json');
const T = decodeTerrainJson(terrainJson, decodeUint16, decodeUint8);
const RING = decodeRingJson(load('ring.json'), decodeUint16);
const q = createHeightQueries(T, RING);

// world position of grid node (column c, row r): row 0 is north, column 0 is west
const node = (c, r) => ({ x: (c / (T.n - 1) - 0.5) * T.W, z: (r / (T.n - 1) - 0.5) * T.H });
const nearestNode = (x, z) => ({ c: Math.round((x / T.W + 0.5) * (T.n - 1)), r: Math.round((z / T.H + 0.5) * (T.n - 1)) });
const raw = (c, r) => (decodeUint16(terrainJson.heights_u16_b64)[r * T.n + c] / 65535) * terrainJson.range_m;

describe('heightAt', () => {
  // Cheyava Falls (origin), the habitat waypoint (HAB in route.json) and the steep spot named in the assets README
  for (const [name, x, z] of [['Cheyava Falls', 0, 0], ['habitat waypoint', 520, 600], ['steep spot', -201, -52]]) {
    it(`matches terrain.json exactly at the grid node nearest the ${name}`, () => {
      const { c, r } = nearestNode(x, z), p = node(c, r);
      expect(q.heightAt(p.x, p.z)).toBeCloseTo(raw(c, r), 4);
    });
  }

  it('agrees with the cost grid (src/sim/costGrid.js) within 1 cm away from grid nodes', () => {
    const grid = buildCostGrid(terrainJson);
    for (const [x, z] of [[0.7, -3.3], [512.4, 593.1], [-197.2, -49.9], [300.5, 250.25]]) {
      expect(Math.abs(q.heightAt(x, z) - gridHeightAt(grid, x, z))).toBeLessThan(0.01);
    }
  });

  it('uses the CTX ring outside the HiRISE tile', () => {
    expect(q.inTile(900, 0)).toBe(false);
    expect(q.heightAt(900, 0)).toBeCloseTo(q.ringH(900, 0), 6);
  });
});

describe('slopeAt', () => {
  it('is steeper than the 25 degree walking limit at the steep spot', () => {
    expect(q.slopeAt(-201, -52)).toBeGreaterThan(25);
  });

  it('is 0 on flat synthetic ground', () => {
    const flat = createHeightQueries({ n: 11, W: 100, H: 100, h: new Float32Array(121).fill(5) });
    expect(q.slopeAt(0, 0)).toBeGreaterThanOrEqual(0);
    expect(flat.slopeAt(10, 10)).toBe(0);
  });
});

describe('lineOfSight', () => {
  // synthetic 200 x 200 m tile: flat at 0 m with a 10 m high ridge along x = 0
  const n = 101, h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = Math.abs(c - 50) <= 1 ? 10 : 0;
  const ridge = createHeightQueries({ n, W: 200, H: 200, h });

  it('is clear between two points on the same side of the ridge', () => {
    expect(ridge.lineOfSight({ x: -80, z: 0 }, { x: -20, z: 30 })).toEqual({ clear: true, blockedAt: null });
  });

  it('is blocked across the ridge at eye height and reports where', () => {
    const r = ridge.lineOfSight({ x: -50, z: 0 }, { x: 50, z: 0 });
    expect(r.clear).toBe(false);
    expect(Math.abs(r.blockedAt.x)).toBeLessThanOrEqual(2);
  });

  it('is clear across the ridge when both points are high enough', () => {
    expect(ridge.lineOfSight({ x: -50, y: 15, z: 0 }, { x: 50, y: 15, z: 0 }).clear).toBe(true);
  });
});
