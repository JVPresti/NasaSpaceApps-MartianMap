import { describe, expect, it } from 'vitest';
import { pinchCrop } from './mapPinch.js';

const tile = { width: 1400, depth: 1500 };
const rect = { left: 10, top: 20, width: 400 };
const start = { x0: -200, z0: -200, size: 400 };   // 1 m per pixel
const p = (x, y) => ({ x, y });

describe('pinchCrop', () => {
  it('zooms in about the midpoint when the fingers spread', () => {
    // midpoint at map pixel (200, 200): ground (0, 0); fingers twice as far apart
    const c = pinchCrop(start, [p(160, 220), p(260, 220)], [p(110, 220), p(310, 220)], rect, tile, 50);
    expect(c.size).toBeCloseTo(200);
    expect(c.x0 + (200 / 400) * c.size).toBeCloseTo(0);
    expect(c.z0 + (200 / 400) * c.size).toBeCloseTo(0);
  });

  it('pans with the midpoint when the distance stays', () => {
    const c = pinchCrop(start, [p(160, 220), p(260, 220)], [p(200, 260), p(300, 260)], rect, tile, 50);
    expect(c.size).toBeCloseTo(400);
    expect(c.x0).toBeCloseTo(-240);
    expect(c.z0).toBeCloseTo(-240);
  });

  it('keeps the crop between the smallest side and the tile', () => {
    const tight = pinchCrop(start, [p(200, 220), p(220, 220)], [p(10, 220), p(410, 220)], rect, tile, 120);
    expect(tight.size).toBe(120);
    const wide = pinchCrop(start, [p(10, 220), p(410, 220)], [p(205, 220), p(215, 220)], rect, tile, 120);
    expect(wide.size).toBe(1400);
    expect(wide.x0).toBeGreaterThanOrEqual(-700);
    expect(wide.x0 + wide.size).toBeLessThanOrEqual(700);
  });
});
