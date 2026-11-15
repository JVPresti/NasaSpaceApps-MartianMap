import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { drawMinimap } from '../hud/minimapDraw.js';
import { parseTraverse, photoGroups } from './traverse.js';

const path = (p) => fileURLToPath(new URL(p, import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(path(p), 'utf8'));
const shipped = readJson('../../public/data/traverse.json');
const terrain = readJson('../../public/marswalk/assets/terrain.json');
const stops = readJson('../../public/data/stops.json');

describe('public/data/traverse.json (#249)', () => {
  const traverse = parseTraverse(shipped);

  it('is DATA from the Mars 2020 MMGIS layers, with a full provenance block', () => {
    expect(shipped.tag).toBe('DATA');
    expect(shipped.provenance).toMatchObject({ mission: 'Mars 2020', url: expect.stringMatching(/^https:\/\/mars\.nasa\.gov\//) });
    expect(shipped.provenance.data_url).toMatch(/M20_traverse\.json$/);
    for (const field of ['instrument', 'product_id', 'site', 'sol_or_date', 'reference', 'license', 'note']) {
      expect(shipped.provenance[field], field).toEqual(expect.any(String));
    }
    expect(shipped.frame).toMatch(/metres from Cheyava Falls/);
  });

  it('keeps every drive inside the tile, in sol order, over the sols the rover spent there', () => {
    expect(traverse.drives).toHaveLength(shipped.drives.length);
    expect(traverse.drives.length).toBeGreaterThan(20);
    expect(traverse.sols).toEqual([1140, 1266]);
    for (const drive of traverse.drives) {
      for (const [x, z] of drive.path) {
        expect(Math.abs(x)).toBeLessThanOrEqual(terrain.width_m / 2 + 1e-6);
        expect(Math.abs(z)).toBeLessThanOrEqual(terrain.depth_m / 2 + 1e-6);
      }
    }
    const sols = traverse.drives.map((d) => d.sol);
    expect(sols).toEqual([...sols].sort((a, b) => a - b));
    const length = traverse.drives.reduce((sum, d) => sum + d.path.slice(1).reduce((s, [x, z], k) => s + Math.hypot(x - d.path[k][0], z - d.path[k][1]), 0), 0);
    expect(length).toBeCloseTo(shipped.stats.length_m, -1);
  });

  it('pins every Perseverance image of stops.json at the rover position of its sol', () => {
    const images = stops.stops.flatMap((s) => (s.images ?? []).filter((i) => Number.isFinite(i.sol)).map((i) => ({ ...i, stop: s.id })));
    expect(traverse.photos.map((p) => p.file).sort()).toEqual(images.map((i) => i.file).sort());
    for (const photo of traverse.photos) {
      const image = images.find((i) => i.file === photo.file);
      expect(photo.sol).toBe(image.sol);
      expect(photo.stop).toBe(image.stop);
      expect(photo.rover.sol).toBeLessThanOrEqual(photo.sol);
      expect(existsSync(path(`../../public/data/${photo.file}`)), photo.file).toBe(true);
    }
  });

  it('agrees with the tile origin: the rover parked within a few metres of Cheyava Falls, on its own track', () => {
    for (const photo of traverse.photos) {
      expect(Math.hypot(photo.x, photo.z), photo.file).toBeLessThan(10);
      const nearest = Math.min(...traverse.drives.flatMap((d) => d.path.map(([x, z]) => Math.hypot(x - photo.x, z - photo.z))));
      expect(nearest, photo.file).toBeLessThan(3);
    }
  });

  it('draws the three photos as one pin: they were all taken from the same rover stop', () => {
    const groups = photoGroups(traverse.photos);
    expect(groups).toHaveLength(1);
    expect(groups[0].photos.map((p) => p.sol)).toEqual([1187, 1212, 1217]);
  });
});

describe('parseTraverse', () => {
  it('drops drives and photos it cannot draw', () => {
    const parsed = parseTraverse({
      drives: [{ sol: 1, path: [[0, 0], [1, 1]] }, { sol: 2, path: [[0, 0]] }, { sol: 'x', path: [[0, 0], [1, 1]] }, { sol: 3, path: [[0, 0], [NaN, 1], [2, 2]] }],
      photos: [{ file: 'a.jpg', sol: 5, x: 1, z: 2 }, { file: 'b.jpg', sol: 5, x: null, z: 2 }],
    });
    expect(parsed.drives.map((d) => d.sol)).toEqual([1, 3]);
    expect(parsed.drives[1].path).toEqual([[0, 0], [2, 2]]);
    expect(parsed.photos.map((p) => p.file)).toEqual(['a.jpg']);
    expect(parsed.sols).toEqual([1, 3]);
    expect(parsed.tag).toBe('DATA');
  });

  it('refuses a file without drives', () => {
    expect(() => parseTraverse({})).toThrow(/drives/);
    expect(() => parseTraverse(null)).toThrow(/drives/);
  });
});

describe('photo pins', () => {
  it('keeps photos far apart on their own pins, each at the mean of its photos', () => {
    const groups = photoGroups([{ x: 0, z: 0, sol: 2 }, { x: 10, z: 0, sol: 1 }, { x: 300, z: 0, sol: 3 }]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ x: 5, z: 0 });
    expect(groups[0].photos.map((p) => p.sol)).toEqual([1, 2]);
    expect(photoGroups([])).toEqual([]);
  });
});

describe('the minimap draws the traverse', () => {
  /** A 2D context that records each call; any method works and returns another recorder. */
  function recorder() {
    const calls = [];
    const make = () => new Proxy(function stub() {}, {
      get: (target, key) => (key in target ? target[key] : (...args) => { calls.push([key, args]); return make(); }),
      set: (target, key, value) => { target[key] = value; return true; },
    });
    return { g: make(), calls };
  }
  const view = { size: 200, dpr: 1, centre: { x: 0, z: 0 }, headingDeg: 0, rangeM: 150, route: { path: null, waypoints: [] } };

  it('adds the drives to the frame when the file has loaded, and draws as before without it', () => {
    const without = recorder();
    drawMinimap(without.g, view);
    const withTrack = recorder();
    drawMinimap(withTrack.g, { ...view, traverse: parseTraverse(shipped) });
    const lines = (calls) => calls.filter(([k]) => k === 'lineTo').length;
    expect(lines(withTrack.calls)).toBeGreaterThan(lines(without.calls) + 100);
  });
});
