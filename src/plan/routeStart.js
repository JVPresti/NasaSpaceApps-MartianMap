/**
 * The planned route starts at the habitat airlock, where the EVA starts (#166).
 *
 * route.json's HAB waypoint (520, 600) is the centre the engine searches for a flat spot to place the habitat on
 * (src/engine/habitat.js), so the habitat stands up to 30 m away from it. The airlock entry is the HAB entry in
 * public/data/shelters.json, at the foot of the airlock steps (scripts/build-shelters.mjs). Planning from HAB left
 * the astronaut 20 m off the first leg at the start, past the off-route threshold, and made the walkback lead to a
 * point outside the habitat. Plain JavaScript, no React.
 */

/**
 * @param {Array<{ name: string, x: number, z: number }>} waypoints from route.json
 * @param {{ shelters?: Array<{ id: string, x: number, z: number }> } | null} sheltersJson public/data/shelters.json
 * @returns {Array<{ name: string, x: number, z: number }>} the same list, with HAB moved to the airlock entry
 */
export function startAtAirlock(waypoints, sheltersJson) {
  const entry = sheltersJson?.shelters?.find((s) => s.id === 'HAB');
  if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) return waypoints;
  return waypoints.map((w) => (w.name === 'HAB' ? { ...w, x: entry.x, z: entry.z } : w));
}
