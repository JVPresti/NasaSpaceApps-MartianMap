import { afterEach, describe, expect, it } from 'vitest';
import { catalogs, setLanguage } from '../i18n/index.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { RISK_SETTINGS } from '../sim/missionNeeds.js';
import { resetStore, setNeeds } from '../state/store.js';
import {
  EXPOSURE_RANGE, LAYERS, SLOPE_LIMITS, WALK_LAYERS, cautionDeg, layerMeta, layerSource, nextLayerIndex, terrainSwatches, walkLayerIndex, walkRow,
} from './layers.js';

afterEach(() => { resetStore(); setLanguage('en'); });

describe('map layers', () => {
  it('keeps one list in view.layer order', () => {
    expect(LAYERS.map((layer) => layer.id)).toEqual(['none', 'slope', 'rock', 'outcrop', 'radio', 'exposure']);
    LAYERS.forEach((layer, index) => {
      expect(layer.index).toBe(index);
      expect(layerMeta(index)).toBe(layer);
    });
  });

  it('has no Elevation layer: its contours are part of Terrain', () => {
    expect(LAYERS.find((layer) => layer.id === 'elevation')).toBeUndefined();
    expect(layerMeta(1).name).toBe('Terrain');
    expect(layerMeta(1).summary).toMatch(/contour every 5 m/);
    expect(layerMeta(1).walkSwatches.at(-1)).toMatchObject({ color: '#ffffff', label: 'Contours', detail: 'every 5 m' });
  });

  it('gives every layer a unit, a source and what it decides, in English and Spanish', () => {
    for (const language of ['en', 'es']) {
      setLanguage(language);
      for (const layer of LAYERS) {
        expect(layer.unit.length).toBeGreaterThan(0);
        expect(layer.source).toMatch(/^(DATA|DERIVED|SIM) · /);
        expect(layer.summary.length).toBeGreaterThan(10);
        expect(typeof layer.decides).toBe('string');
        expect(Object.hasOwn(catalogs[language], layer.decides)).toBe(true);
        expect(catalogs[language][layer.decides].length).toBeGreaterThan(20);
      }
    }
  });

  it('marks the table-only layers and keeps Walk to the layers the ground draws', () => {
    expect(LAYERS.filter((layer) => !layer.walk).map((layer) => layer.id)).toEqual(['radio', 'exposure']);
    expect(WALK_LAYERS.map((layer) => layer.id)).toEqual(['none', 'slope', 'rock', 'outcrop']);
    expect([0, 1, 2, 3, 4, 5, 99].map(walkLayerIndex)).toEqual([0, 1, 2, 3, 0, 0, 0]);
    expect([0, 1, 2, 3, 4, 5].map(walkRow)).toEqual([0, 1, 2, 3, 0, 0]);
  });

  it('steps through every layer at the table and only the ground layers in Walk, wrapping both ways', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => nextLayerIndex(i, 1, 'plan'))).toEqual([1, 2, 3, 4, 5, 0]);
    expect([0, 1, 2, 3, 4, 5].map((i) => nextLayerIndex(i, -1, 'plan'))).toEqual([5, 0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3].map((i) => nextLayerIndex(i, 1, 'walk'))).toEqual([1, 2, 3, 0]);
    expect([0, 1, 2, 3].map((i) => nextLayerIndex(i, -1, 'walk'))).toEqual([3, 0, 1, 2]);
    // a table-only layer still chosen in the store counts as none in Walk
    expect(nextLayerIndex(4, 1, 'walk')).toBe(1);
    expect(nextLayerIndex(5, -1, 'walk')).toBe(3);
  });

  it('builds the slope limits from the cost grid', () => {
    expect(SLOPE_LIMITS).toEqual({ caution: COST_CONSTANTS.SLOPE_CAUTION_DEG, noGo: COST_CONSTANTS.SLOPE_LIMIT_DEG });
    expect(SLOPE_LIMITS).toEqual({ caution: 15, noGo: 20 });
    const terrain = layerMeta(1);
    expect(terrain.walkSwatches.map((swatch) => swatch.label)).toEqual(['0–15°', '15–20°', '>20°', 'Contours']);
    expect(terrain.summary).toContain('15° caution, 20° no-go');
    expect(terrain.summary).not.toMatch(/25°|\{/);
  });

  it('moves the table caution band with the risk setting, priced like the suit caution at standard risk', () => {
    expect(cautionDeg('standard')).toBe(SLOPE_LIMITS.caution);
    expect(cautionDeg('cautious')).toBe(Math.round((15 * RISK_SETTINGS.cautious.slopePenaltyDeg) / RISK_SETTINGS.standard.slopePenaltyDeg));
    expect(cautionDeg('cautious')).toBe(12);
    expect(cautionDeg('bold')).toBe(20);   // never past the no-go limit, which never moves
    expect(cautionDeg('unknown')).toBe(15);
    expect(terrainSwatches('standard').map((s) => `${s.label} ${s.detail}`)).toEqual(['0–15° walkable', '15–20° caution at standard risk', '>20° no-go', 'Contours every 5 m']);
    expect(terrainSwatches('cautious').map((s) => s.label)).toEqual(['0–12°', '12–20°', '>20°', 'Contours']);
    expect(terrainSwatches('bold').map((s) => `${s.label} ${s.detail}`)).toEqual(['0–20° walkable at bold risk', '>20° no-go', 'Contours every 5 m']);
    expect(terrainSwatches('standard')[0].clear).toBe(true);   // the table map leaves walkable ground clear
  });

  it('reads the risk for the table legend from the crew needs in the store', () => {
    expect(layerMeta(1).swatches[1].label).toBe('15–20°');
    setNeeds({ risk: 'cautious' });
    expect(layerMeta(1).swatches[1].label).toBe('12–20°');
    expect(layerMeta(1).walkSwatches[1].label).toBe('15–20°');   // the ground in Walk keeps the suit limits
  });

  it('describes the rock range, the outcrop stops, the radio shadow and the narrow exposure range', () => {
    expect(layerMeta(2).minLabel).toBe('0.08');
    expect(layerMeta(2).maxLabel).toBe('1.0');
    expect(layerMeta(2).summary).toMatch(/route planner prices/);
    expect(layerMeta(3).swatches.map((s) => s.label)).toEqual(['Stop on the route', 'Candidate stop']);
    expect(layerMeta(3).walkSwatches).toEqual([]);
    expect(layerMeta(4).swatches).toHaveLength(1);
    expect(EXPOSURE_RANGE).toEqual({ min: 0.81, max: 1 });
    expect(layerMeta(5).summary).toMatch(/narrow, about 0.81 to 1.0/);
    expect(layerMeta(5).minLabel).toBe('0.81 sheltered');
    expect(layerMeta(5).maxLabel).toBe('1.0 open sky');
    setLanguage('es');
    expect(layerMeta(5).summary).toMatch(/0,81 a 1,0/);
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
