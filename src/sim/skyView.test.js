import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeSkyView, decodeSkyViewGrid, rayDistances, sampleSkyView, skyViewAlongPath, skyViewAt, skyViewFromTangents, SKY_VIEW_DEFAULTS,
} from './skyView.js';

const CELL = 2;

/** Synthetic height grid centred on (0, 0), 2 m spacing. */
function syntheticGrid(n, heightFn) {
  const width = (n - 1) * CELL;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1) - 0.5) * width;
      const z = (j / (n - 1) - 0.5) * width;
      heights[j * n + i] = heightFn(x, z);
    }
  }
  return { n, width, depth: width, heights };
}

const SMALL = { maxDistanceM: 60, azimuths: 32 };

describe('sky view factor', () => {
  it('is 1 on flat ground', () => {
    const grid = syntheticGrid(61, () => 10);
    const { skyView } = computeSkyView(grid, SMALL);
    for (const value of skyView) expect(value).toBeCloseTo(1, 6);
  });

  it('is clearly lower at the bottom of a pit', () => {
    // 20 m deep, 10 m radius: the rim sits at atan(19 / 10) = 62 deg from a 1 m eye.
    const grid = syntheticGrid(61, (x, z) => (Math.hypot(x, z) < 10 ? 0 : 20));
    const { skyView } = skyViewAt(grid, 0, 0, SMALL);
    const expected = 1 - Math.sin(Math.atan(19 / 10));
    expect(skyView).toBeLessThan(0.3);
    expect(skyView).toBeCloseTo(expected, 1);
  });

  it('is lower in a channel than on the plain beside it', () => {
    const grid = syntheticGrid(61, (x) => (Math.abs(x) < 6 ? 0 : 8));
    const inChannel = skyViewAt(grid, 0, 0, SMALL).skyView;
    const onPlain = skyViewAt(grid, 40, 0, SMALL).skyView;
    expect(onPlain).toBeCloseTo(1, 6);
    expect(inChannel).toBeLessThan(0.7);
    // Open along the channel axis, closed across it.
    const { horizonDeg } = skyViewAt(grid, 0, 0, SMALL);
    expect(horizonDeg[0]).toBeCloseTo(0, 6);
    expect(horizonDeg[8]).toBeGreaterThan(45);
  });

  it('is symmetric on a symmetric grid', () => {
    const n = 41;
    const grid = syntheticGrid(n, (x, z) => 0.002 * (x * x + z * z) + 5 * Math.cos(x / 7) * Math.cos(z / 7));
    const { skyView } = computeSkyView(grid, { maxDistanceM: 40, azimuths: 32 });
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const v = skyView[j * n + i];
        expect(skyView[j * n + (n - 1 - i)]).toBeCloseTo(v, 5);
        expect(skyView[(n - 1 - j) * n + i]).toBeCloseTo(v, 5);
        expect(skyView[i * n + j]).toBeCloseTo(v, 5);
      }
    }
  });

  it('integrates the visible solid angle', () => {
    expect(skyViewFromTangents([0, 0, 0, 0])).toBe(1);
    // Horizon at 30 deg all round: 1 - sin 30 = 0.5.
    const t = Math.tan(Math.PI / 6);
    expect(skyViewFromTangents([t, t, t, t])).toBeCloseTo(0.5, 10);
  });

  it('samples rays out to the maximum distance', () => {
    const d = rayDistances(SKY_VIEW_DEFAULTS);
    expect(d[0]).toBe(SKY_VIEW_DEFAULTS.firstStepM);
    expect(d[d.length - 1]).toBeLessThanOrEqual(SKY_VIEW_DEFAULTS.maxDistanceM);
    expect(d[d.length - 1]).toBeGreaterThan(SKY_VIEW_DEFAULTS.maxDistanceM - SKY_VIEW_DEFAULTS.maxStepM);
  });

  it('rejects bad options', () => {
    const grid = syntheticGrid(5, () => 0);
    expect(() => computeSkyView(grid, { azimuths: 2 })).toThrow();
    expect(() => computeSkyView(grid, { maxDistanceM: 0 })).toThrow();
    expect(() => computeSkyView(grid, { stride: 3 })).toThrow(/divisor of 4/);
  });

  it('keeps every stride-th node, edges included, with the full grid values', () => {
    const grid = syntheticGrid(41, (x, z) => (Math.hypot(x, z) < 12 ? 0 : 10));
    const full = computeSkyView(grid, SMALL);
    const coarse = computeSkyView(grid, { ...SMALL, stride: 4 });
    expect(coarse).toMatchObject({ n: 11, stride: 4 });
    for (let row = 0; row < coarse.n; row += 1) {
      for (let col = 0; col < coarse.n; col += 1) {
        expect(coarse.skyView[row * coarse.n + col]).toBeCloseTo(full.skyView[row * 4 * 41 + col * 4], 6);
      }
    }
  });
});

/** A sky view file as scripts/build-sky-view.mjs writes it, from plain values. */
function skyFile(n, size, valueAt, encoding = { min: 0.8, max: 1 }) {
  const bytes = new Uint8Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      bytes[j * n + i] = Math.round(((valueAt(i, j) - encoding.min) / (encoding.max - encoding.min)) * 255);
    }
  }
  return { n, width_m: size, depth_m: size, encoding, sky_view_u8_b64: Buffer.from(bytes).toString('base64') };
}

describe('the coarse sky view grid the app reads', () => {
  it('decodes the bytes back to sky view, north-west node first', () => {
    const sky = decodeSkyViewGrid(skyFile(3, 100, (i, j) => (i === 0 && j === 0 ? 0.8 : 1)));
    expect(sky).toMatchObject({ n: 3, width: 100, depth: 100 });
    expect(sky.values[0]).toBeCloseTo(0.8, 6);
    expect(sky.values[8]).toBeCloseTo(1, 6);
    expect(sky.min).toBeCloseTo(0.8, 6);
    expect(sky.max).toBeCloseTo(1, 6);
    expect(sampleSkyView(sky, -50, -50)).toBeCloseTo(0.8, 6);   // x west, z north: the first node
    expect(sampleSkyView(sky, -25, -50)).toBeCloseTo(0.9, 2);   // halfway to the next node east
    expect(sampleSkyView(sky, -500, -500)).toBeCloseTo(0.8, 6);   // outside the tile: the edge
  });

  it('rejects a file that does not hold n x n samples', () => {
    expect(() => decodeSkyViewGrid({ ...skyFile(3, 100, () => 1), n: 4 })).toThrow(/16/);
    expect(() => decodeSkyViewGrid({ ...skyFile(3, 100, () => 1), encoding: { min: 1, max: 1 } })).toThrow();
    expect(() => decodeSkyViewGrid(null)).toThrow();
  });

  it('measures the mean, the range and the most hidden point along a route, weighted by length', () => {
    // west half 0.9, east half 1.0 on a 200 m tile with 5 nodes 50 m apart
    const sky = decodeSkyViewGrid(skyFile(5, 200, (i) => (i <= 1 ? 0.9 : 1)));
    const west = skyViewAlongPath(sky, [[-100, 0], [-50, 0]]);
    expect(west.lengthM).toBeCloseTo(50, 6);
    expect(west.mean).toBeCloseTo(0.9, 2);
    const east = skyViewAlongPath(sky, [[0, 0], [100, 0]]);
    expect(east.mean).toBeCloseTo(1, 2);
    expect(east.min).toBeCloseTo(1, 2);
    // 50 m at 0.9 and 100 m at 1.0, with a 50 m ramp between them in the middle
    const across = skyViewAlongPath(sky, [[-100, 0], [-50, 0], [0, 0], [100, 0]]);
    expect(across.lengthM).toBeCloseTo(200, 6);
    expect(across.mean).toBeCloseTo((50 * 0.9 + 50 * 0.95 + 100 * 1) / 200, 2);
    expect(across.min).toBeCloseTo(0.9, 2);
    expect(across.max).toBeCloseTo(1, 2);
    expect(across.lowest.x).toBeLessThan(-50);
  });

  it('has no readout without a route or a grid', () => {
    const sky = decodeSkyViewGrid(skyFile(3, 100, () => 1));
    expect(skyViewAlongPath(sky, null)).toBeNull();
    expect(skyViewAlongPath(sky, [[0, 0]])).toBeNull();
    expect(skyViewAlongPath(sky, [[0, 0], [0, 0]])).toBeNull();
    expect(skyViewAlongPath(null, [[0, 0], [10, 0]])).toBeNull();
  });
});

describe('public/data/sky_view.json', () => {
  const json = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/sky_view.json', import.meta.url)), 'utf8'));
  const sky = decodeSkyViewGrid(json);
  const shelters = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/shelters.json', import.meta.url)), 'utf8'));

  it('covers the terrain tile and says where it comes from', () => {
    expect(sky.width).toBeCloseTo(1422.5, 0);
    expect(sky.depth).toBe(1500);
    expect((json.source_n - 1) / json.stride + 1).toBe(json.n);
    expect(json.tag).toBe('DERIVED');
    expect(json.provenance.note).toMatch(/isotropic SEP flux above the horizon/);
  });

  it('spans the narrow range the shelters file measured on the full grid', () => {
    expect(sky.min).toBeGreaterThan(0.8);
    expect(sky.min).toBeLessThan(0.85);
    expect(sky.max).toBeCloseTo(1, 2);
    expect(sky.min).toBeGreaterThanOrEqual(shelters.sky_view.tile_stats.min - 0.002);
  });

  it('agrees with the exact sky view at each natural shelter', () => {
    for (const shelter of shelters.shelters.filter((s) => s.type === 'natural')) {
      expect(Math.abs(sampleSkyView(sky, shelter.x, shelter.z) - shelter.values.sky_view_factor.value)).toBeLessThan(0.03);
    }
  });
});
