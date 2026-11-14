import { describe, expect, it } from 'vitest';
import { stormLightFactors } from './stormLight.js';

describe('stormLightFactors', () => {
  it('leaves the preset light alone without dust', () => {
    expect(stormLightFactors(0)).toEqual({ sun: 1, ambient: 1, sky: 1, inscatter: 1, red: 0 });
  });
  it('dims the sun much more than the sky light in a full storm', () => {
    const f = stormLightFactors(1);
    expect(f.sun).toBeCloseTo(0.1);
    expect(f.ambient).toBeCloseTo(0.6);
    expect(f.sun).toBeLessThan(f.ambient);
    expect(f.red).toBe(1);
  });
  it('changes steadily with the level and clamps outside 0..1', () => {
    expect(stormLightFactors(0.5).sun).toBeGreaterThan(stormLightFactors(0.8).sun);
    expect(stormLightFactors(2)).toEqual(stormLightFactors(1));
  });
});
