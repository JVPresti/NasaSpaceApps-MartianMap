/**
 * Daylight at the site (#324): when the Sun sets and how much of the plan it covers.
 *
 * The Sun's position is sunPosition.js (spherical astronomy on one fixed declination). This module answers the one
 * question the go / no-go needs: with the crew out at this LMST, how long until sunset, and does the plan (the walk
 * out, the work at the stops and the walk back) end before it?
 *
 *   sunset: sin(elev) = 0  =>  cos(H0) = -tan(lat) tan(dec),  sunset = 12 h + H0 / 15
 *
 * The LMST is used as solar time (no equation of time), as in sunPosition.js. The horizon is 0 deg elevation: the
 * thickness of a thinner atmosphere is left out, so the figure is the geometry, not an almanac.
 *   DERIVED: the latitude of Cheyava Falls, 18.4975 N.
 *   SIM:     the declination, 11 deg, the same one sunPosition.js uses (its own note says it is our choice for the
 *            demo start). While the declination is SIM, so is the sunset; #294 will bring the real one for sol 1210.
 *
 * Plain JavaScript, no three.js, no React; tested without a browser.
 */

import { SITE_LATITUDE_DEG, SOLAR_DECLINATION_DEG } from './sunPosition.js';

const RAD = Math.PI / 180;
const SEC_PER_HOUR = 3600;

/**
 * Sunrise and sunset for a latitude and a declination, or null when the Sun does not cross the horizon that sol
 * (polar day or night; not Mars at 18.5 N, but the caller gets a null rather than a wrong hour).
 * @param {{ latitudeDeg?: number, declinationDeg?: number }} [options]
 * @returns {null | { sunriseHours: number, sunsetHours: number, daylightSec: number }} hours after local midnight
 */
export function daylightWindow({ latitudeDeg = SITE_LATITUDE_DEG, declinationDeg = SOLAR_DECLINATION_DEG } = {}) {
  if (!Number.isFinite(latitudeDeg)) throw new Error('daylightWindow: latitudeDeg must be a finite number');
  if (!Number.isFinite(declinationDeg)) throw new Error('daylightWindow: declinationDeg must be a finite number');
  const cosH0 = -Math.tan(latitudeDeg * RAD) * Math.tan(declinationDeg * RAD);
  if (cosH0 >= 1 || cosH0 <= -1) return null;   // the Sun stays below or above the horizon all sol
  const halfDayHours = Math.acos(cosH0) / RAD / 15;
  return { sunriseHours: 12 - halfDayHours, sunsetHours: 12 + halfDayHours, daylightSec: halfDayHours * 2 * SEC_PER_HOUR };
}

/**
 * Daylight left from an egress time, against a plan.
 * @param {{ hours: number, declinationDeg?: number, latitudeDeg?: number, planSec?: number }} input
 *   hours: the LMST the crew goes out at, hours after local midnight (0 to 24)
 *   planSec: the time the plan takes outside the airlock, walk out plus work plus walk back
 * @returns {null | {
 *   hours: number, sunriseHours: number, sunsetHours: number, toSunsetSec: number, planSec: number,
 *   leftSec: number, ok: boolean }}
 *   toSunsetSec: egress to sunset, negative once the Sun is down; leftSec: that, less the plan (negative when the
 *   plan would end after sunset); ok: the plan ends in daylight. null when the Sun never sets that sol.
 */
export function daylightLeft({ hours, declinationDeg = SOLAR_DECLINATION_DEG, latitudeDeg = SITE_LATITUDE_DEG, planSec = 0 }) {
  if (!Number.isFinite(hours)) throw new Error('daylightLeft: hours must be a finite number');
  if (!Number.isFinite(planSec) || planSec < 0) throw new Error('daylightLeft: planSec must be a finite number of seconds');
  const window = daylightWindow({ latitudeDeg, declinationDeg });
  if (!window) return null;
  const toSunsetSec = (window.sunsetHours - hours) * SEC_PER_HOUR;
  return {
    hours,
    sunriseHours: window.sunriseHours,
    sunsetHours: window.sunsetHours,
    toSunsetSec,
    planSec,
    leftSec: toSunsetSec - planSec,
    ok: planSec <= toSunsetSec,
  };
}
