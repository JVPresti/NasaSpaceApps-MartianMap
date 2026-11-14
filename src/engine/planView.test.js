import { describe, expect, it } from 'vitest';
import { formatScaleLength, metresPerPixel, niceScaleLength } from './planView.js';

describe('plan camera scale', () => {
  it('computes metres per pixel from height, field of view and viewport', () => {
    const height = 1750;
    const fov = 62;
    const viewport = 1000;
    const expected = (2 * height * Math.tan((fov * Math.PI) / 360)) / viewport;
    expect(metresPerPixel(height, fov, viewport)).toBeCloseTo(expected, 6);
  });

  it('covers more ground per pixel as the camera rises', () => {
    expect(metresPerPixel(3500, 62, 1000)).toBeGreaterThan(
      metresPerPixel(1750, 62, 1000),
    );
  });

  it('returns zero for invalid input instead of NaN', () => {
    expect(metresPerPixel(0, 62, 1000)).toBe(0);
    expect(metresPerPixel(1750, 0, 1000)).toBe(0);
    expect(metresPerPixel(1750, 62, 0)).toBe(0);
  });
});

describe('scale bar', () => {
  it('picks a round length that fits the target width', () => {
    const bar = niceScaleLength(120, 2);
    expect(bar.metres).toBe(200);
    expect(bar.px).toBeCloseTo(100, 6);
  });

  it('rounds to 1, 2 or 5 times a power of ten', () => {
    expect(niceScaleLength(100, 1).metres).toBe(100);
    expect(niceScaleLength(100, 3).metres).toBe(200);
    expect(niceScaleLength(100, 7).metres).toBe(500);
    expect(niceScaleLength(100, 13).metres).toBe(1000);
  });

  it('formats metres and kilometres', () => {
    expect(formatScaleLength(200)).toBe('200 m');
    expect(formatScaleLength(1000)).toBe('1 km');
    expect(formatScaleLength(1500)).toBe('1.5 km');
    expect(formatScaleLength(0)).toBe('—');
  });
});
