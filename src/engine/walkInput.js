// First-person movement input (#227): the movement keys become one normalised step, so no key combination is
// faster than the walk or jog speed. Plain JavaScript, no three.js, so the key combinations test quickly.
// Yaw convention: 0 faces north (-z), clockwise positive, the same as view.yaw (fwd = (sin yaw, -cos yaw)).

/** Left / right / backward / forward axis values of the movement keys. */
export function moveAxes(down) {
  let dx = 0, dz = 0;
  if (down('KeyD') || down('ArrowRight')) dx += 1;
  if (down('KeyA') || down('ArrowLeft')) dx -= 1;
  if (down('KeyW') || down('ArrowUp')) dz -= 1;
  if (down('KeyS') || down('ArrowDown')) dz += 1;
  return { dx, dz };
}

/**
 * One frame's world-space step from the movement keys, normalised: any combination of keys moves at most
 * `speed * dt` metres, so walking diagonally is not faster than walking straight (#227).
 * @param {(code: string) => boolean} down key predicate (the input gate's isDown)
 * @param {number} yaw view yaw in radians, 0 = north, clockwise positive
 * @param {number} speed walk or jog speed in m/s
 * @param {number} dt frame time in seconds
 * @returns {{ x: number, z: number, forward: number }} world metres east and south, and the signed forward
 *   component in m/s (negative when moving backward; 0 when strafing) — the legs use it to retime the clip
 */
export function walkStep(down, yaw, speed, dt) {
  const { dx, dz } = moveAxes(down);
  if (speed <= 0 || dt <= 0 || (dx === 0 && dz === 0)) return { x: 0, z: 0, forward: 0 };
  const len = Math.hypot(dx, dz), s = (speed * dt) / len;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);      // forward
  const rx = -fz, rz = fx;                            // right
  return {
    x: (rx * dx + fx * -dz) * s,
    z: (rz * dx + fz * -dz) * s,
    forward: (-dz / len) * speed,
  };
}
