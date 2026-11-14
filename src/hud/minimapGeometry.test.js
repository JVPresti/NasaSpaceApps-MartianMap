import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/store.js';
import {
  MINIMAP_RANGE_M, TILE_DEPTH_M, TILE_WIDTH_M, activeHazardZones, bearingToScreenVector,
  cardinalPoints, niceScaleBar, projectToMap, splitShelters, tileUvToWorld, worldToTileUv,
} from './minimapGeometry.js';

const readJson = (path) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));

const route = readJson('public/marswalk/assets/route.json');
const sheltersJson = readJson('public/data/shelters.json');
const terrain = readJson('public/marswalk/assets/terrain.json');

const view = (overrides = {}) => ({
  centreX: 0, centreZ: 0, headingDeg: 0, scalePxPerM: 2, cx: 100, cy: 100, ...overrides,
});

describe('minimap tile coordinates', () => {
  it('maps Cheyava Falls to the middle of the HiRISE tile and the tile edges to 0 and 1', () => {
    expect(worldToTileUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(worldToTileUv(-TILE_WIDTH_M / 2, -TILE_DEPTH_M / 2)).toEqual({ u: 0, v: 0 });
    expect(worldToTileUv(TILE_WIDTH_M / 2, TILE_DEPTH_M / 2).u).toBeCloseTo(1, 12);
    expect(worldToTileUv(TILE_WIDTH_M / 2, TILE_DEPTH_M / 2).v).toBeCloseTo(1, 12);
    expect(TILE_WIDTH_M).toBeCloseTo(1422.5, 1);
    expect(TILE_DEPTH_M).toBe(1500);
  });

  it('uses the real five route.json waypoints', () => {
    const expected = [
      [520, 600, 0.865552026, 0.9],
      [330, 300, 0.73198494, 0.7],
      [150, 120, 0.6054477, 0.58],
      [-40, -60, 0.471880613, 0.46],
      [0, 0, 0.5, 0.5],
    ];
    expect(route.waypoints.map((w) => [w.x, w.z])).toEqual(expected.map(([x, z]) => [x, z]));
    for (const [x, z, u, v] of expected) {
      const uv = worldToTileUv(x, z);
      expect(uv.u).toBeCloseTo(u, 8);
      expect(uv.v).toBeCloseTo(v, 8);
      const back = tileUvToWorld(uv.u, uv.v);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.z).toBeCloseTo(z, 9);
    }
  });

  it('matches the HiRISE tile dimensions the terrain mesh uses', () => {
    // terrain.json drives the 3D tile; a changed export must not silently move the minimap photo.
    expect(TILE_WIDTH_M).toBe(terrain.width_m);
    expect(TILE_DEPTH_M).toBe(terrain.depth_m);
  });

  it('keeps the same metres per pixel on both axes', () => {
    const east = projectToMap(50, 0, view());
    const south = projectToMap(0, 50, view());
    expect(Math.hypot(east.x - 100, east.y - 100)).toBeCloseTo(100, 9);
    expect(Math.hypot(south.x - 100, south.y - 100)).toBeCloseTo(100, 9);
  });
});

describe('heading-up projection', () => {
  it('keeps the navigation fix exactly at the centre', () => {
    for (const headingDeg of [0, 37, 90, 180, 270, 359.9]) {
      const p = projectToMap(520, 600, view({ centreX: 520, centreZ: 600, headingDeg }));
      expect(p.x).toBeCloseTo(100, 9);
      expect(p.y).toBeCloseTo(100, 9);
    }
  });

  it('points the heading to the top and rotates the cardinal directions', () => {
    const north = [0, -50], east = [50, 0], south = [0, 50], west = [-50, 0];
    const cases = [[0, north], [90, east], [180, south], [270, west]];
    for (const [headingDeg, [x, z]] of cases) {
      const p = projectToMap(x, z, view({ headingDeg }));
      expect(p.x).toBeCloseTo(100, 9);
      expect(p.y).toBeCloseTo(0, 9);
    }
  });

  it('wraps headings without changing the map', () => {
    const north = (headingDeg) => projectToMap(0, -100, view({ headingDeg }));
    expect(north(350).x).toBeCloseTo(north(-10).x, 12);
    expect(north(350).y).toBeCloseTo(north(-10).y, 12);
    expect(north(10).x).toBeCloseTo(north(370).x, 12);
    expect(north(350).x).toBeGreaterThan(north(0).x);   // north leans right when heading is 350
  });

  it('places N, E, S and W around the rim for heading 0 and 90', () => {
    const northVector = bearingToScreenVector(0, 0);
    expect(northVector.x).toBeCloseTo(0, 12);
    expect(northVector.y).toBeCloseTo(-1, 12);
    const eastVector = bearingToScreenVector(90, 0);
    expect(eastVector.x).toBeCloseTo(1, 12);
    expect(eastVector.y).toBeCloseTo(0, 12);
    const flat = cardinalPoints(0, 100, 100, 50);
    expect(flat.find((p) => p.label === 'N')).toMatchObject({ x: 100, y: 50 });
    expect(flat.find((p) => p.label === 'E')).toMatchObject({ x: 150, y: 100 });
    const turned = cardinalPoints(90, 100, 100, 50);
    expect(turned.find((p) => p.label === 'N').x).toBeCloseTo(50, 9);
    expect(turned.find((p) => p.label === 'N').y).toBeCloseTo(100, 9);
  });
});

describe('minimap scale', () => {
  it('chooses a readable 1-2-5 scale bar in metres or kilometres', () => {
    const local = niceScaleBar(MINIMAP_RANGE_M, 117);
    expect(local).toEqual({ meters: 200, px: 58.5, label: '200 m' });
    expect(niceScaleBar(2000, 100)).toMatchObject({ meters: 1000, px: 50, label: '1 km' });
    expect(niceScaleBar(0, 100)).toBeNull();
    expect(niceScaleBar(400, 0)).toBeNull();
  });
});

describe('minimap data rules', () => {
  it('draws only active, valid hazard zones', () => {
    const zones = [
      { id: 'a', x: 10, z: 20, radiusM: 30, active: true },
      { id: 'b', x: 10, z: 20, radiusM: 30, active: false },
      { id: 'c', x: null, z: 20, radiusM: 30, active: true },
      { id: 'd', x: 10, z: 20, radiusM: 0, active: true },
      { id: 'e', x: 10, z: 20, radiusM: -4, active: true },
      { id: 'f', x: 10, z: 20, radiusM: 30, active: 'yes' },
      null,
      { id: 'g', x: 0, z: 0, radiusM: 1, active: true },
    ];
    expect(activeHazardZones(zones).map((z) => z.id)).toEqual(['a', 'g']);
    expect(activeHazardZones(undefined)).toEqual([]);
  });

  it('starts with no hazard zones in the store: empty means unknown, not safe', () => {
    expect(createInitialState().hazards).toEqual({ zones: [] });
  });

  it('keeps the habitat airlock distinct from the HAB route waypoint', () => {
    const { habitat, refuges } = splitShelters(sheltersJson.shelters);
    expect(habitat).toMatchObject({ id: 'HAB', type: 'habitat', x: 535.1, z: 574.1 });
    expect(refuges.map((s) => s.id)).toEqual(['SP1', 'SP2', 'SP3', 'SP4']);
    const habWaypoint = route.waypoints.find((w) => w.name === 'HAB');
    expect(habWaypoint).toMatchObject({ x: 520, z: 600 });
    const a = projectToMap(habitat.x, habitat.z, view({ scalePxPerM: 1 }));
    const b = projectToMap(habWaypoint.x, habWaypoint.z, view({ scalePxPerM: 1 }));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(30.0, 0);
  });
});
