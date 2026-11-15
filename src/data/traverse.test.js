import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildTraverse, clipPolyline, formatJson, lineLength, projector, rmcFromImageId, roverStopForSol, simplify,
} from '../../scripts/build-traverse.mjs';
import { groupImages, parseTraverse } from './traverse.js';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));
const meta = read('blender/data/jezero_cheyava_meta.json');
const terrain = read('public/marswalk/assets/terrain.json');
const stops = read('public/data/stops.json').stops;
const file = read('public/data/traverse.json');

describe('the traverse build (#249)', () => {
  it('projects the tile origin to 0, 0 and the sol 1210 end of drive a few metres west and south', () => {
    const toEngine = projector({ lat: meta.center_latlon[0], lon: meta.center_latlon[1] }, 3396190);
    const origin = toEngine(meta.center_latlon[1], meta.center_latlon[0]);
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.z).toBeCloseTo(0, 6);
    const stop = toEngine(77.30519089, 18.49748444);   // RMC 56_0, MMGIS M20_waypoints
    expect(stop.x).toBeCloseTo(-4.69, 1);
    expect(stop.z).toBeCloseTo(1.74, 1);
  });

  it('clips a line to the tile, splitting it where it leaves and comes back', () => {
    const line = [{ x: -20, z: 0 }, { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }, { x: 0, z: 30 }];
    const parts = clipPolyline(line, 10, 20);
    expect(parts).toEqual([[{ x: -10, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 }]]);
    const back = clipPolyline([{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 5 }, { x: 0, z: 5 }], 10, 10);
    expect(back).toHaveLength(2);
    expect(back[1][0]).toEqual({ x: 10, z: 5 });
    expect(clipPolyline([{ x: 50, z: 50 }, { x: 60, z: 60 }], 10, 10)).toEqual([]);
  });

  it('simplifies away points that sit on the line and keeps the corners', () => {
    const line = [{ x: 0, z: 0 }, { x: 1, z: 0.1 }, { x: 2, z: 0 }, { x: 2, z: 5 }];
    expect(simplify(line, 0.5)).toEqual([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 5 }]);
    expect(lineLength([{ x: 0, z: 0 }, { x: 3, z: 4 }])).toBe(5);
  });

  it('reads the rover site and drive from a Mars 2020 raw image ID', () => {
    expect(rmcFromImageId('ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ')).toBe('54_1010');
    expect(rmcFromImageId('PIA26401')).toBeNull();
  });

  it('places an image on a sol without a drive at the end of the last drive, and refuses a sol with one', () => {
    const drives = [{ sol: 1206, toRMC: '55_340' }, { sol: 1210, toRMC: '56_0' }, { sol: 1219, toRMC: '56_784' }];
    expect(roverStopForSol(1212, drives)).toBe('56_0');
    expect(roverStopForSol(1217, drives)).toBe('56_0');
    expect(roverStopForSol(1210, drives)).toBeNull();
    expect(roverStopForSol(1000, drives)).toBeNull();
  });

  it('builds the file from the two layers, with a provenance block for the traverse and each image', () => {
    const lonLat = (x, z) => [meta.center_latlon[1] + x / (Math.cos(meta.center_latlon[0] * Math.PI / 180) * 3396190 * Math.PI / 180), meta.center_latlon[0] - z / (3396190 * Math.PI / 180)];
    const traverse = { features: [
      { properties: { sol: 1185, fromRMC: '54_866', toRMC: '54_1010' }, geometry: { type: 'LineString', coordinates: [lonLat(-900, 0), lonLat(-4.8, 2.6)] } },
      { properties: { sol: 1210, fromRMC: '55_340', toRMC: '56_0' }, geometry: { type: 'LineString', coordinates: [lonLat(10, -3), lonLat(-4.7, 1.7)] } },
    ] };
    const waypoints = { features: [
      { properties: { RMC: '54_1010', sol: 1185, lon: lonLat(-4.8, 2.6)[0], lat: lonLat(-4.8, 2.6)[1], Note: 'End-of-drive localization' } },
      { properties: { RMC: '56_0', sol: 1210, lon: lonLat(-4.7, 1.7)[0], lat: lonLat(-4.7, 1.7)[1], Note: 'End-of-drive localization' } },
    ] };
    const { output, skipped } = buildTraverse({ traverse, waypoints, meta, terrain, stops });
    expect(skipped).toEqual([]);
    expect(output.traverse.sols).toEqual([1185, 1210]);
    expect(output.traverse.drives[0].points[0]).toEqual([-711.3, 0.5]);   // clipped where it crosses the west edge of the tile
    expect(output.images.map((i) => [i.image_id, i.rmc, i.tag])).toEqual([
      ['ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ', '54_1010', 'DATA'],
      ['PIA26401', '56_0', 'DERIVED'],
      ['PIA26368', '56_0', 'DERIVED'],
    ]);
    for (const block of [output.traverse.provenance, ...output.images.map((i) => i.provenance)]) {
      expect(Object.keys(block)).toHaveLength(11);   // public/data/README.md: all eleven keys, always
      expect(block.url).toMatch(/^https:\/\//);
      expect(block.license).toBeTruthy();
    }
    expect(formatJson({ p: [[1.5, -2]] })).toBe('{\n  "p": [\n    [1.5, -2]\n  ]\n}\n');
  });
});

describe('public/data/traverse.json', () => {
  const data = parseTraverse(file);

  it('keeps every drive inside the tile, in sol order', () => {
    expect(data.drives.length).toBeGreaterThan(10);
    for (const drive of data.drives) {
      for (const [x, z] of drive.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(terrain.width_m / 2 + 0.05);
        expect(Math.abs(z)).toBeLessThanOrEqual(terrain.depth_m / 2 + 0.05);
      }
    }
    expect(data.drives.map((d) => d.sol)).toEqual(data.drives.map((d) => d.sol).sort((a, b) => a - b));
    expect(data.sols).toEqual([data.drives[0].sol, data.drives.at(-1).sol]);
  });

  it('places every stop image, each one a file of stops.json, at Cheyava Falls', () => {
    const files = stops.flatMap((s) => s.images.map((i) => i.file));
    expect(data.images.map((i) => i.file).sort()).toEqual(files.slice().sort());
    for (const image of data.images) expect(Math.hypot(image.x, image.z)).toBeLessThan(10);
  });

  it('groups the three images into one pin', () => {
    const pins = groupImages(data.images);
    expect(pins).toHaveLength(1);
    expect(pins[0].images.map((i) => i.sol)).toEqual([1187, 1212, 1217]);
  });

  it('rejects a drive without points', () => {
    expect(() => parseTraverse({ traverse: { sols: [1, 2], drives: [{ sol: 1, points: [[0, 0]] }] } })).toThrow(/drive 0/);
  });
});
