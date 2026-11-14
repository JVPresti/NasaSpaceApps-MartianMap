// Where boot prints go (bootPrints.js, #46). Plain JavaScript, no three.js, so it tests quickly.
// One tracker per walker: feed it the walker's position every frame and it returns the prints of the steps taken.
// Basis: the Z-2 "walk" clip covers about 1 m per cycle, two steps (docs/marswalk-assets/README.md); jogging is the
// low-gravity lope with 2 m strides, so 1 m per step.

export const STEP_WALK_M = 0.5;
export const STEP_JOG_M = 1.0;
export const JOG_FROM_MS = 1.25;     // same threshold as the head bob in view.js
export const FOOT_OFFSET_M = 0.11;   // each print sits this far left or right of the walking line
const TELEPORT_M = 3;                // a bigger jump in one frame is a teleport: no prints along it
const MIN_MOVE_M = 0.002;

/**
 * @returns {{ track: (x: number, z: number, dt: number, facingYaw?: number) => Array<{ x: number, z: number, yaw: number, side: 1 | -1 }>, reset: () => void }}
 * yaw: the way the toe points, in radians, 0 = north (-z), clockwise positive (the same convention as view.yaw).
 * Feet point the way the walker faces, not the way they move: walking backwards or sideways still leaves the toes
 * facing forward. Without facingYaw the direction of movement is used.
 */
export function createStepTracker() {
  let last = null, travelled = 0, side = 1;
  return {
    track(x, z, dt, facingYaw) {
      if (!last) { last = { x, z }; return []; }
      const dx = x - last.x, dz = z - last.z, d = Math.hypot(dx, dz);
      if (d > TELEPORT_M) { last = { x, z }; travelled = 0; return []; }
      if (d < MIN_MOVE_M) return [];
      const speed = d / Math.max(dt, 1e-4), step = speed > JOG_FROM_MS ? STEP_JOG_M : STEP_WALK_M;
      const yaw = Number.isFinite(facingYaw) ? facingYaw : Math.atan2(dx, -dz), out = [];
      // perpendicular to the way the walker faces, pointing right
      const rx = Math.cos(yaw), rz = Math.sin(yaw);
      travelled += d;
      while (travelled >= step) {
        travelled -= step;
        const back = travelled / d;   // where along this frame's move the step landed
        const px = x - dx * back, pz = z - dz * back;
        out.push({ x: px + rx * FOOT_OFFSET_M * side, z: pz + rz * FOOT_OFFSET_M * side, yaw, side });
        side = -side;
      }
      last = { x, z };
      return out;
    },
    reset() { last = null; travelled = 0; },
  };
}
