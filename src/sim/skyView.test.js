import { describe, expect, it } from 'vitest';
import { computeSkyView, rayDistances, skyViewAt, skyViewFromTangents, SKY_VIEW_DEFAULTS } from './skyView.js';

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
  });
});
