import { describe, expect, it } from 'vitest';
import { acrossLabel, clampCrop, layerColour, mapCrop, marsColour, paintMap, slopeGrid, toMap, zoomCrop } from './mapLayers.js';

const tile = { width: 1422.5, depth: 1500 };
const route = [{ x: 535, z: 574 }, { x: 330, z: 300 }, { x: 150, z: 120 }, { x: -40, z: -60 }, { x: 0, z: 0 }];

describe('mission table map', () => {
  it('frames the whole route in a square inside the tile', () => {
    const crop = mapCrop(route, tile);
    for (const p of route) {
      const [u, v] = toMap(p.x, p.z, crop);
      expect(u).toBeGreaterThan(0); expect(u).toBeLessThan(100);
      expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(100);
    }
    expect(crop.x0).toBeGreaterThanOrEqual(-tile.width / 2);
    expect(crop.z0 + crop.size).toBeLessThanOrEqual(tile.depth / 2);
    expect(acrossLabel(crop.size)).toMatch(/^\d+ m across$/);
  });

  it('puts north up and east right', () => {
    const crop = { x0: -100, z0: -100, size: 200 };
    expect(toMap(0, -100, crop)[1]).toBe(0);    // z is south, so the smallest z is the top edge
    expect(toMap(100, 0, crop)[0]).toBe(100);
  });

  it('zooms about the pointer and stays inside the tile', () => {
    const crop = { x0: -100, z0: -100, size: 400 };
    const zoomed = zoomCrop(crop, 0.5, 0.25, 0.75, tile);
    expect(zoomed.size).toBe(200);
    expect(zoomed.x0 + 0.25 * zoomed.size).toBeCloseTo(crop.x0 + 0.25 * crop.size);
    expect(zoomed.z0 + 0.75 * zoomed.size).toBeCloseTo(crop.z0 + 0.75 * crop.size);
    expect(zoomCrop(crop, 0.01, 0.5, 0.5, tile).size).toBe(120);
    expect(clampCrop({ x0: 5000, z0: -5000, size: 300 }, tile)).toEqual({ x0: tile.width / 2 - 300, z0: -tile.depth / 2, size: 300 });
  });

  it('uses the terrain shader colours and slope limits', () => {
    expect(marsColour(0)).toEqual([0.068, 0.042, 0.021]);
    expect(layerColour(1, { slope: 10 })[3]).toBe(0);
    expect(layerColour(1, { slope: 20 }).slice(0, 3)).toEqual([0.95, 0.6, 0.1]);
    expect(layerColour(1, { slope: 30 }).slice(0, 3)).toEqual([0.9, 0.08, 0.05]);
  });

  it('measures slope on the height grid and paints every pixel', () => {
    const n = 3;
    const heights = new Float32Array([0, 1, 2, 0, 1, 2, 0, 1, 2]);   // rises 1 m per 1 m to the east
    const slopes = slopeGrid({ n, width: 2, depth: 2, heights });
    expect(slopes[4]).toBeCloseTo(45, 5);
    const ortho = { w: 2, h: 2, data: new Uint8ClampedArray(16).fill(128) };
    const out = paintMap(new Uint8ClampedArray(4 * 4 * 4), 4, { x0: -1, z0: -1, size: 2 }, 1,
      { ortho, mask: null, terrain: { n, width: 2, depth: 2, heights, range: 2 }, slopes });
    expect([...out].filter((value, k) => k % 4 === 3).every((a) => a === 255)).toBe(true);
  });
});
