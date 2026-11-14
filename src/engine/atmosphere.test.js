import { describe, expect, it } from 'vitest';
import presets from '../../public/marswalk/assets/atmosphere_presets.json';
import { blendPresets } from './atmosphere.js';

const clear = presets.presets.clear_day;
const storm = presets.presets.dust_storm;

describe('atmosphere blending', () => {
  it('returns the first preset at t = 0', () => {
    const blended = blendPresets(clear, storm, 0);
    expect(blended.sky.intensity).toBe(clear.sky.intensity);
    expect(blended.sun.color).toEqual(clear.sun.color);
    expect(blended.fog.color).toEqual(clear.fog.color);
  });

  it('returns the second preset at t = 1', () => {
    const blended = blendPresets(clear, storm, 1);
    expect(blended.sky.intensity).toBe(storm.sky.intensity);
    expect(blended.fog.blender_extinction_per_m).toBe(storm.fog.blender_extinction_per_m);
    expect(blended.exposure_stops).toBe(storm.exposure_stops);
  });

  it('moves every scalar halfway at t = 0.5', () => {
    const blended = blendPresets(clear, storm, 0.5);
    expect(blended.sky.intensity).toBeCloseTo((clear.sky.intensity + storm.sky.intensity) / 2, 6);
    expect(blended.sun.intensity).toBeCloseTo((clear.sun.intensity + storm.sun.intensity) / 2, 6);
    expect(blended.sky.zenith[0]).toBeCloseTo((clear.sky.zenith[0] + storm.sky.zenith[0]) / 2, 6);
  });

  it('keeps the sun direction a unit vector and clamps t', () => {
    const blended = blendPresets(clear, storm, 4);
    expect(Math.hypot(...blended.sun.direction_threejs)).toBeCloseTo(1, 6);
    expect(blended.exposure_stops).toBe(storm.exposure_stops);
  });
});
