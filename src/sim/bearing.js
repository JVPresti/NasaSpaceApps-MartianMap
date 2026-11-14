// Angles in the engine frame: x east, z south. Bearings are degrees clockwise from north. No React, no three.js.

/** Wraps any angle into [0, 360). */
export const wrapDeg = (d) => ((d % 360) + 360) % 360;

/** Bearing from a to b in degrees clockwise from north. North is -z in this frame. */
export function bearingDeg(a, b) {
  return wrapDeg(Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI);
}
