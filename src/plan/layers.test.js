import { describe, expect, it } from 'vitest';
import { LAYERS, SLOPE_LIMITS, layerMeta, layerSource } from './layers.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';

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

  it('builds the slope legend from the cost grid limits', () => {
    expect(SLOPE_LIMITS).toEqual({
      caution: COST_CONSTANTS.SLOPE_CAUTION_DEG,
      noGo: COST_CONSTANTS.SLOPE_LIMIT_DEG,
    });
    expect(SLOPE_LIMITS).toEqual({ caution: 15, noGo: 20 });
    const slope = layerMeta(1);
    expect(slope.swatches.map((swatch) => swatch.label)).toEqual([
      '0–15°',
      '15–20°',
      '>20°',
    ]);
    expect(slope.summary).toContain('15° caution, 20° no-go');
    expect(slope.summary).not.toMatch(/25°|\{/);
  });

  it('describes the elevation contours and rock range', () => {
    expect(layerMeta(2).swatches[0].detail).toMatch(/5 m/);
    expect(layerMeta(3).minLabel).toBe('0.08');
    expect(layerMeta(3).maxLabel).toBe('1.0');
  });

  it('states the source resolution separately from the displayed resolution (#250)', () => {
    expect(layerMeta(0).summary).toMatch(/source 25 cm per pixel/i);
    expect(layerMeta(0).summary).toMatch(/about 0.5 m/i);
  });

  it('falls back to the no-layer entry for an unknown index', () => {
    expect(layerMeta(99).id).toBe('none');
    expect(layerSource(99)).toMatch(/HiRISE/);
  });
});
