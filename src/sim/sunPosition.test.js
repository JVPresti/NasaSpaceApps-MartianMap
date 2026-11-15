import { describe, expect, it } from 'vitest';
import presets from '../../public/marswalk/assets/atmosphere_presets.json';
import { angleBetweenDeg, sunPosition } from './sunPosition.js';

describe('sun position (#73)', () => {
  it('puts the demo start, 17:45, near the late_afternoon preset sun', () => {
    const s = sunPosition(17.75);
    expect(s.elevationDeg).toBeCloseTo(7, 0);
    expect(s.azimuthDeg).toBeGreaterThan(270);   // a little north of west
    expect(s.azimuthDeg).toBeLessThan(300);
    const preset = presets.presets.late_afternoon.sun.direction_threejs;
    expect(angleBetweenDeg(s.direction, preset)).toBeLessThan(12);
  });

  it('is highest at noon, due south of the zenith for a declination below the latitude', () => {
    const noon = sunPosition(12);
    expect(noon.elevationDeg).toBeCloseTo(90 - (18.4975 - 11), 5);
    expect(noon.direction[2]).toBeGreaterThan(0);   // z is south
    expect(sunPosition(11).elevationDeg).toBeLessThan(noon.elevationDeg);
  });

  it('rises in the east, sets in the west and is below the horizon at midnight', () => {
    expect(sunPosition(9).direction[0]).toBeGreaterThan(0);
    expect(sunPosition(15).direction[0]).toBeLessThan(0);
    expect(sunPosition(0).elevationDeg).toBeLessThan(-50);
    expect(sunPosition(24).elevationDeg).toBeCloseTo(sunPosition(0).elevationDeg, 9);
  });

  it('returns a unit direction whose height matches the elevation', () => {
    for (const h of [3, 8.5, 12, 17.75, 21]) {
      const { direction: d, elevationDeg } = sunPosition(h);
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
      expect(Math.asin(d[1]) * 180 / Math.PI).toBeCloseTo(elevationDeg, 9);
    }
  });

  it('moves several degrees over a 30-minute EVA at time scale 1', () => {
    // 30 Earth minutes are 29.2 Mars minutes of LMST
    const a = sunPosition(17.75), b = sunPosition(17.75 + 29.2 / 60);
    expect(angleBetweenDeg(a.direction, b.direction)).toBeGreaterThan(5);
  });

  it('rejects a time that is not a number', () => {
    expect(() => sunPosition(NaN)).toThrow();
  });
});
