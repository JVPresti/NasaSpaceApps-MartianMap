import { describe, expect, it } from 'vitest';
import { LAYERS, SLOPE_LIMITS, layerMeta, layerSource } from './layers.js';

describe('plan layers', () => {
  it('matches the engine layer order', () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual([
      'none',
      'slope',
      'elevation',
      'rock',
      'outcrop',
    ]);
    LAYERS.forEach((layer, index) => {
      expect(layer.index).toBe(index);
      expect(layerMeta(index)).toBe(layer);
    });
  });

  it('gives every layer a unit and a source', () => {
    for (const layer of LAYERS) {
      expect(layer.unit.length).toBeGreaterThan(0);
      expect(layer.source).toMatch(/DATA|DERIVED|SIM/);
      expect(layer.summary.length).toBeGreaterThan(10);
    }
  });

  it('uses the 15 and 25 degree slope limits', () => {
    expect(SLOPE_LIMITS).toEqual({ caution: 15, noGo: 25 });
    const slope = layerMeta(1);
    expect(slope.swatches.map((swatch) => swatch.label)).toEqual([
      '0–15°',
      '15–25°',
      '>25°',
    ]);
  });

  it('describes the elevation contours and rock range', () => {
    expect(layerMeta(2).swatches[0].detail).toMatch(/5 m/);
    expect(layerMeta(3).minLabel).toBe('0.08');
    expect(layerMeta(3).maxLabel).toBe('1.0');
  });

  it('falls back to the no-layer entry for an unknown index', () => {
    expect(layerMeta(99).id).toBe('none');
    expect(layerSource(99)).toMatch(/HiRISE/);
  });
});
