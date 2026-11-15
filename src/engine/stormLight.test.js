import { describe, expect, it } from 'vitest';
import { stormLightFactors } from './stormLight.js';
import { dustLevelFromTau } from '../state/dustLevel.js';

describe('stormLightFactors', () => {
  it('leaves the preset light alone without dust', () => {
    expect(stormLightFactors(0)).toEqual({ tau: 0.45, sun: 1, disc: 1, ambient: 1, sky: 1, inscatter: 1, red: 0 });
  });
  it('dims the direct sun by Beer-Lambert through the dust above the clear season', () => {
    const sunY = Math.sin(50 * Math.PI / 180);
    const f = stormLightFactors(dustLevelFromTau(5.3), sunY);
    expect(f.tau).toBeCloseTo(5.3);
    expect(f.sun).toBeCloseTo(Math.exp(-(5.3 - 0.45) / sunY), 6);
    expect(f.sun).toBeLessThan(0.01);   // tau 5.3: no hard shadows left (#203)
    expect(f.ambient).toBeCloseTo(Math.exp(-0.13 * (5.3 - 0.45)), 6);
    expect(f.ambient).toBeGreaterThan(100 * f.sun);
  });
  it('dims a low sun more, but caps the slant path near the horizon', () => {
    const level = dustLevelFromTau(1.2);
    expect(stormLightFactors(level, 0.3).sun).toBeLessThan(stormLightFactors(level, 0.9).sun);
    expect(stormLightFactors(level, 0.01).sun).toBeCloseTo(stormLightFactors(level, 0.15).sun);
    expect(stormLightFactors(level, -0.5).sun).toBeCloseTo(stormLightFactors(level, 0.15).sun);
  });
  it('keeps most of the sky light, so a full storm is dim, not black', () => {
    const f = stormLightFactors(1);
    expect(f.sun).toBeLessThan(1e-3);
    expect(f.ambient).toBeCloseTo(Math.exp(-0.13 * 7.55));
    expect(f.ambient).toBeGreaterThan(0.3);
    expect(f.disc).toBeCloseTo(0.1);
    expect(f.red).toBe(1);
  });
  it('changes steadily with the level and clamps outside 0..1', () => {
    expect(stormLightFactors(0.5).sun).toBeGreaterThan(stormLightFactors(0.8).sun);
    expect(stormLightFactors(0.5).ambient).toBeGreaterThan(stormLightFactors(0.8).ambient);
    expect(stormLightFactors(2)).toEqual(stormLightFactors(1));
    expect(stormLightFactors(Number.NaN)).toEqual(stormLightFactors(0));
  });
});
