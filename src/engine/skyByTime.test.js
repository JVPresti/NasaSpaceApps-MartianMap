import { describe, expect, it } from 'vitest';
import file from '../../public/marswalk/assets/atmosphere_presets.json';
import { blendLook } from './presetBlend.js';
import { presetsForElevation, skyAtSun, sunVisibility } from './skyByTime.js';
import { sunPosition } from '../sim/sunPosition.js';

const P = file.presets;
const sunAt = (elevationDeg) => ({ elevationDeg, direction: [0, Math.sin(elevationDeg * Math.PI / 180), Math.cos(elevationDeg * Math.PI / 180)] });

describe('sky by Sun elevation (#73)', () => {
  it('is the preset itself at each preset elevation', () => {
    expect(skyAtSun(P, sunAt(55)).sky).toEqual(expect.objectContaining({ zenith: P.clear_day.sky.zenith, halo_strength: P.clear_day.sky.halo_strength }));
    expect(skyAtSun(P, sunAt(80)).exposure_stops).toBeCloseTo(P.clear_day.exposure_stops, 9);
    const late = skyAtSun(P, sunAt(7));
    expect(late.sky.halo_color).toEqual(P.late_afternoon.sky.halo_color);   // the blue glow around the Sun
    expect(late.sky.halo_strength).toBe(P.late_afternoon.sky.halo_strength);
    expect(late.sun.intensity).toBe(P.late_afternoon.sun.intensity);
    expect(skyAtSun(P, sunAt(-30)).sky.stars).toBe(1);
  });

  it('changes smoothly with the elevation, with no jump between presets', () => {
    let prev = skyAtSun(P, sunAt(-20));
    for (let e = -19.5; e <= 70; e += 0.5) {
      const s = skyAtSun(P, sunAt(e));
      expect(Math.abs(s.exposure_stops - prev.exposure_stops)).toBeLessThan(0.15);
      expect(Math.abs(s.sky.halo_strength - prev.sky.halo_strength)).toBeLessThan(0.1);
      prev = s;
    }
  });

  it('uses the real Sun direction and switches the direct light off below the horizon', () => {
    const sun = sunPosition(17.75);
    expect(skyAtSun(P, sun).sun.direction_threejs).toEqual(sun.direction);
    expect(sunVisibility(5)).toBe(1);
    expect(sunVisibility(-2)).toBe(0);
    expect(skyAtSun(P, sunAt(-3)).sun.intensity).toBe(0);
    expect(skyAtSun(P, sunAt(-3)).sky.intensity).toBeGreaterThan(0);
  });

  it('blends between neighbours only', () => {
    expect(presetsForElevation(30)).toMatchObject({ from: 'late_afternoon', to: 'clear_day' });
    expect(presetsForElevation(0)).toMatchObject({ from: 'night', to: 'late_afternoon' });
  });
});

describe('storm look (#73)', () => {
  it('moves the sky colours and the Sun disc toward dust_storm but keeps the brightness', () => {
    const base = skyAtSun(P, sunAt(30));
    const half = skyAtSun(P, sunAt(30), 0.5), full = skyAtSun(P, sunAt(30), 1);
    expect(full.sky.zenith).toEqual(P.dust_storm.sky.zenith);
    expect(full.sun.angular_diameter_deg).toBe(P.dust_storm.sun.angular_diameter_deg);
    expect(half.sky.horizon[1]).toBeCloseTo((base.sky.horizon[1] + P.dust_storm.sky.horizon[1]) / 2, 9);
    // stormLight.js and dust.js dim and thicken with the dust: not blended twice here
    expect(full.sun.intensity).toBe(base.sun.intensity);
    expect(full.exposure_stops).toBe(base.exposure_stops);
    expect(full.fog.blender_extinction_per_m).toBe(base.fog.blender_extinction_per_m);
  });

  it('returns the same preset with no storm', () => {
    const p = skyAtSun(P, sunAt(30));
    expect(blendLook(p, P.dust_storm, 0)).toBe(p);
  });
});
