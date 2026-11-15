// Camera geometry for the presentation (#291): one camera that flies from orbit to the ground. Plain JavaScript.
//
// A shot is an orbit around a target: { lat, lon } (degrees), a distance in metres, a heading (yaw, degrees clockwise
// from north, the way the camera looks) and a pitch (degrees, negative looks down). Both renderers read the same shot:
// the globe in planet-centred coordinates and the engine in its local metres (x east, z south, from Cheyava Falls),
// so the hand-off from the globe to the HiRISE terrain is the same picture.

export const MARS_RADIUS_M = 3396190;               // the sphere of the Jezero DTM projection (GeoTIFF GeogSemiMajorAxis)
export const ORIGIN = { lat: 18.4975, lon: 77.3053 };   // Cheyava Falls, the engine's origin
export const BASE_ELEV_M = -2393.37;               // terrain.json base_elev_m: engine y 0 is this far below the datum
const RAD = Math.PI / 180;

/** Engine metres to latitude and longitude, on the sphere, at the origin's scale. */
export function localToGeo(x, z) {
  return { lat: ORIGIN.lat - (z / MARS_RADIUS_M) / RAD, lon: ORIGIN.lon + (x / (MARS_RADIUS_M * Math.cos(ORIGIN.lat * RAD))) / RAD };
}

/** Latitude and longitude to engine metres. */
export function geoToLocal(lat, lon) {
  return { x: (lon - ORIGIN.lon) * RAD * MARS_RADIUS_M * Math.cos(ORIGIN.lat * RAD), z: -(lat - ORIGIN.lat) * RAD * MARS_RADIUS_M };
}

/** A box { west, south, east, north } in degrees to engine metres [x0, z0, x1, z1] (west, north, east, south). */
export function boxToLocal([west, south, east, north]) {
  const a = geoToLocal(north, west), b = geoToLocal(south, east);
  return [a.x, a.z, b.x, b.z];
}

const shortAngle = (a, b) => { let d = ((b - a + 540) % 360) - 180; if (d < -180) d += 360; return d; };

/**
 * Blend two shots. `zoom` blends the distance in log space, so a fall from orbit keeps a steady feel at every scale.
 * @param {{ lat: number, lon: number, dist: number, yaw: number, pitch: number, fov: number }} a
 * @param {typeof a} b
 * @param {number} u 0 to 1, already eased
 */
export function blendShot(a, b, u, { zoom = false } = {}) {
  const lerp = (p, q) => p + (q - p) * u;
  const dist = zoom ? Math.exp(lerp(Math.log(a.dist), Math.log(b.dist))) : lerp(a.dist, b.dist);
  // In a log-distance fall the target should arrive early, so the ground under the camera stays put on screen.
  const ut = zoom ? Math.min(1, u * 1.6) : u;
  const lerpT = (p, q) => p + (q - p) * (zoom ? 1 - Math.pow(1 - ut, 2) : ut);
  return {
    lat: lerpT(a.lat, b.lat), lon: a.lon + shortAngle(a.lon, b.lon) * (zoom ? 1 - Math.pow(1 - ut, 2) : ut),
    dist, yaw: a.yaw + shortAngle(a.yaw, b.yaw) * u, pitch: lerp(a.pitch, b.pitch), fov: lerp(a.fov, b.fov),
    targetH: lerp(a.targetH ?? 0, b.targetH ?? 0),
  };
}

/** Unit view direction in a local east, north, up frame. */
export function viewDir(yawDeg, pitchDeg) {
  const y = yawDeg * RAD, p = pitchDeg * RAD;
  return { e: Math.cos(p) * Math.sin(y), n: Math.cos(p) * Math.cos(y), u: Math.sin(p) };
}

/**
 * The engine camera for a shot: position in engine metres and the yaw and pitch in radians, as cinematic.setShot
 * takes them. targetH is the ground height at the target in engine metres.
 */
export function engineCamera(shot) {
  const t = geoToLocal(shot.lat, shot.lon), d = viewDir(shot.yaw, shot.pitch);
  return {
    x: t.x - d.e * shot.dist, z: t.z + d.n * shot.dist, y: (shot.targetH ?? 0) - d.u * shot.dist,
    yaw: shot.yaw * RAD, pitch: shot.pitch * RAD, fov: shot.fov,
  };
}

/** Height of the camera above the site's base (engine y), for choosing the globe or the terrain. */
export const cameraHeight = (shot) => (shot.targetH ?? 0) - viewDir(shot.yaw, shot.pitch).u * shot.dist;
