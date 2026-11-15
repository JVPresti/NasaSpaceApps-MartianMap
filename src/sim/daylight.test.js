import { describe, expect, it } from 'vitest';
import { daylightLeft, daylightWindow } from './daylight.js';
import { sunPosition } from './sunPosition.js';

// The demo: the site at Cheyava Falls, 18.4975 N, and the 11 deg declination sunPosition.js uses for the demo start
// (17:45 LMST). The Sun crosses the horizon where this module says it does.
const DEMO = { latitudeDeg: 18.4975, declinationDeg: 11 };
const lmst = (hh, mm = 0) => hh + mm / 60;

describe('daylight at the site (#324)', () => {
  it('sets the Sun where the sun position reaches the horizon', () => {
    const { sunriseHours, sunsetHours } = daylightWindow(DEMO);
    expect(sunPosition(sunriseHours, DEMO).elevationDeg).toBeCloseTo(0, 9);
    expect(sunPosition(sunsetHours, DEMO).elevationDeg).toBeCloseTo(0, 9);
    expect(sunPosition(sunsetHours - 0.5, DEMO).elevationDeg).toBeGreaterThan(0);
    expect(sunPosition(sunsetHours + 0.5, DEMO).elevationDeg).toBeLessThan(0);
    // the sunPosition.js note: with 11 deg the demo start stands 7 deg up and the Sun sets before 18:20
    expect(sunsetHours).toBeGreaterThan(18.2);
    expect(sunsetHours).toBeLessThan(18.33);
  });

  it('gives the egress to sunset as minutes, and the plan against it', () => {
    const d = daylightLeft({ hours: lmst(17, 45), ...DEMO, planSec: 10 * 60 });
    expect(d.sunsetHours).toBeCloseTo(18.2486, 4);         // about 18:14 LMST
    expect(d.toSunsetSec).toBeCloseTo(1795, 0);             // 29.9 min from the 17:45 egress
    expect(d.leftSec).toBeCloseTo(1195, 0);                 // 10 min of plan: 19.9 min left
    expect(d.ok).toBe(true);
  });

  it('turns a plan that would end after sunset into not ok', () => {
    const d = daylightLeft({ hours: lmst(17, 45), ...DEMO, planSec: 76 * 60 });   // the full EVA to Cheyava Falls
    expect(d.toSunsetSec).toBeCloseTo(1795, 0);
    expect(d.leftSec).toBeCloseTo(1795 - 76 * 60, 0);       // 46 min short
    expect(d.ok).toBe(false);
    // a plan that ends exactly at sunset is still daylight; a second more is not
    expect(daylightLeft({ hours: lmst(17, 45), ...DEMO, planSec: d.toSunsetSec }).ok).toBe(true);
    expect(daylightLeft({ hours: lmst(17, 45), ...DEMO, planSec: d.toSunsetSec + 1 }).ok).toBe(false);
  });

  it('is already dark when the egress is after sunset (#294: a real sol 1210 declination)', () => {
    const real = daylightLeft({ hours: lmst(17, 45), latitudeDeg: 18.4975, declinationDeg: -23, planSec: 60 });
    expect(real.sunsetHours).toBeLessThan(lmst(17, 45));    // about 17:27
    expect(real.toSunsetSec).toBeLessThan(0);
    expect(real.leftSec).toBeLessThan(0);
    expect(real.ok).toBe(false);
  });

  it('lengthens the day towards the equator and with the declination', () => {
    expect(daylightWindow({ latitudeDeg: 0, declinationDeg: 0 }).daylightSec).toBeCloseTo(12 * 3600, 6);
    expect(daylightWindow({ latitudeDeg: 18.4975, declinationDeg: 25 }).daylightSec)
      .toBeGreaterThan(daylightWindow({ latitudeDeg: 18.4975, declinationDeg: 11 }).daylightSec);
    expect(daylightWindow({ latitudeDeg: 70, declinationDeg: 20 }).daylightSec).toBeGreaterThan(12 * 3600);
  });

  it('has no sunrise or sunset where the Sun does not cross the horizon', () => {
    expect(daylightWindow({ latitudeDeg: 80, declinationDeg: 20 })).toBeNull();   // polar day
    expect(daylightWindow({ latitudeDeg: -80, declinationDeg: 20 })).toBeNull();  // polar night
    expect(daylightLeft({ hours: 12, latitudeDeg: 80, declinationDeg: 20, planSec: 60 })).toBeNull();
  });

  it('rejects an egress time or a plan that is not a number', () => {
    expect(() => daylightLeft({ hours: NaN })).toThrow(/hours/);
    expect(() => daylightLeft({ hours: 17.75, planSec: -1 })).toThrow(/planSec/);
    expect(() => daylightLeft({ hours: 17.75, planSec: Number.POSITIVE_INFINITY })).toThrow(/planSec/);
    expect(() => daylightWindow({ latitudeDeg: NaN })).toThrow(/latitudeDeg/);
  });
});
