// Where the EVA starts: on the ground at the foot of the airlock steps, facing the first waypoint (#166).
// Plain JavaScript, no three.js, so the numbers are testable. Coordinates: x east, z south, metres from Cheyava Falls.
// Yaw is the walk camera's (view.js): 0 faces north (-z), forward = (sin yaw, -cos yaw).

// habitat.json, airlock: "the steps reach the ground at about x = 9.9" (habitat space, +X = airlock end).
// scripts/build-shelters.mjs puts the HAB shelter entry at the same point.
export const AIRLOCK_STEPS_FOOT_M = 9.9;
// The spawn sits a little past the foot so the walker (0.3 m radius) is clear of the steps box, which ends at x = 9.95.
// It stays inside 11.5 m, where the outer hatch is open (habitat.js), so the EVA starts with the hatch open behind you.
export const AIRLOCK_EXIT_M = 10.6;
// The partner (EV2) starts this far to the side of the player, past the 0.9 m collision gap (collide.js PARTNER_GAP).
export const PARTNER_SIDE_M = 2;
// and patrols this far toward the first waypoint and back, as the bench's scripted partner did near Cheyava Falls.
export const PARTNER_PATROL_M = 12;

/**
 * Pose just outside the airlock, facing a target.
 * @param {{ x: number, z: number }} pos habitat origin (habitat.pos)
 * @param {{ x: number, z: number }} dir unit vector toward the airlock end (habitat.dir)
 * @param {{ x: number, z: number }} [toward] what to face; the airlock direction when missing
 * @returns {{ x: number, z: number, yaw: number }}
 */
export function airlockExit(pos, dir, toward) {
  const x = pos.x + dir.x * AIRLOCK_EXIT_M, z = pos.z + dir.z * AIRLOCK_EXIT_M;
  const fx = toward ? toward.x - x : dir.x, fz = toward ? toward.z - z : dir.z;
  return { x, z, yaw: Math.atan2(fx, -fz) };
}

/**
 * Patrol line of the scripted partner: starts beside the player and walks toward the target.
 * @param {{ x: number, z: number, yaw: number }} exit the player's start pose from airlockExit
 * @returns {{ A: { x: number, z: number }, B: { x: number, z: number } }}
 */
export function partnerPatrol(exit) {
  const fx = Math.sin(exit.yaw), fz = -Math.cos(exit.yaw), rx = -fz, rz = fx;   // forward and right, as in view.js
  const A = { x: exit.x + rx * PARTNER_SIDE_M, z: exit.z + rz * PARTNER_SIDE_M };
  return { A, B: { x: A.x + fx * PARTNER_PATROL_M, z: A.z + fz * PARTNER_PATROL_M } };
}
