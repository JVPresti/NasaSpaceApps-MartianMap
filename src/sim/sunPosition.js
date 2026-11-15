/**
 * Sun position at the site from the local solar time (#73).
 *
 * Standard spherical astronomy on a sphere with one fixed solar declination (no seasons):
 *
 *   hour angle  H = 15 deg x (hours - 12)
 *   sin(elev)   = sin(lat) sin(dec) + cos(lat) cos(dec) cos(H)
 *   azimuth     = atan2(-cos(dec) sin(H), sin(dec) cos(lat) - cos(dec) sin(lat) cos(H)), from north, clockwise
 *
 * The local time is the mission's LMST. It is used as solar time, so the equation of time is left out.
 *   DERIVED: the latitude of Cheyava Falls, 18.4975 N.
 *   SIM:     the declination, 11 deg, chosen so that the demo start (17:45 LMST) puts the Sun 7 deg up in the
 *            west-north-west, as the late_afternoon preset was drawn. It lies inside the real range on Mars (about
 *            -25 to +25 deg). Noon is then 82.5 deg up and the Sun sets at about 18:20.
 *
 * Directions use the engine's frame: x east, y up, z south.
 * Plain JavaScript, no three.js.
 */

export const SITE_LATITUDE_DEG = 18.4975;
export const SOLAR_DECLINATION_DEG = 11;

const RAD = Math.PI / 180;

/**
 * @param {number} hours local solar time, 0 to 24 (wraps)
 * @param {{ latitudeDeg?: number, declinationDeg?: number }} [options]
 * @returns {{ elevationDeg: number, azimuthDeg: number, direction: [number, number, number] }} azimuth 0 = north, 90 = east
 */
export function sunPosition(hours, { latitudeDeg = SITE_LATITUDE_DEG, declinationDeg = SOLAR_DECLINATION_DEG } = {}) {
  if (!Number.isFinite(hours)) throw new Error('sunPosition: hours must be a finite number');
  const h = (hours - 12) * 15 * RAD, lat = latitudeDeg * RAD, dec = declinationDeg * RAD;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(h));
  const flat = Math.cos(el);
  return {
    elevationDeg: el / RAD,
    azimuthDeg: ((az / RAD) % 360 + 360) % 360,
    direction: [Math.sin(az) * flat, Math.sin(el), -Math.cos(az) * flat],
  };
}

/** Angle between two unit directions, degrees. */
export function angleBetweenDeg(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d))) / RAD;
}
