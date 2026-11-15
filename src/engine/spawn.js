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

// Inside the habitat, before the EVA (habitat-first flow, src/state/flow.js). The mission table stands at the habitat
// origin (habitat_furniture layout.json: planning_table at 0, 0 with a 0.7 m collision circle, plus the 0.25 m walker
// margin). The main room is walkable out to 2.2 m from the centre (collide.js HAB_ZONES 'main').
// The astronaut starts on the airlock side of the table, facing it, close enough for the table prompt.
export const TABLE_SPAWN_M = 1.75;
// Looking slightly down at the table top (view.js: positive pitch looks down).
export const TABLE_SPAWN_PITCH = 0.18;
// The table opens (E or a click) within this distance of its centre, measured on the floor ...
export const TABLE_REACH_M = 1.9;
// ... while the astronaut faces it within this angle, in radians (about 55 degrees either side).
export const TABLE_FACING_RAD = 0.96;

/**
 * Pose inside the habitat at the mission table: on the airlock side, facing the table.
 * @param {{ x: number, z: number }} pos habitat origin, where the table stands (habitat.pos)
 * @param {{ x: number, z: number }} dir unit vector toward the airlock end (habitat.dir)
 * @returns {{ x: number, z: number, yaw: number, pitch: number }}
 */
export function tableSpawn(pos, dir) {
  return { x: pos.x + dir.x * TABLE_SPAWN_M, z: pos.z + dir.z * TABLE_SPAWN_M, yaw: Math.atan2(-dir.x, dir.z), pitch: TABLE_SPAWN_PITCH };
}

/**
 * True when a walker at (x, z) with this yaw can use the mission table at `table`.
 * @param {{ x: number, z: number }} table the table centre (habitat.pos)
 * @param {{ x: number, z: number, yaw: number }} player
 */
export function atTable(table, player) {
  const dx = table.x - player.x, dz = table.z - player.z, d = Math.hypot(dx, dz);
  if (!(d <= TABLE_REACH_M)) return false;
  if (d < 1e-6) return true;
  const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const cos = (dx * fx + dz * fz) / d;
  return cos >= Math.cos(TABLE_FACING_RAD);
}
