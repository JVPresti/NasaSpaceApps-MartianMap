// The find markers the scene shows (engine.setFinds, src/engine/finds.js), from the store's finds, and when holding Q may
// point at a find. Plain JavaScript.

/**
 * Whether holding Q may point and mark a find now: walking with the mission running and the wrist screen down, and not in
 * the habitat's cabin. There the ground ray (engine.aimGround) passes through the floor and walls to the terrain below,
 * and the card of a find marked there would wait unseen until the crew left (#244).
 * @param {{ mode: string, mission?: { paused?: boolean } }} s the mission store state
 * @param {{ cabin?: boolean, wrist?: boolean }} [where] the player walks in the cabin / the wrist screen is up
 */
export function canPointFind(s, { cabin = false, wrist = false } = {}) {
  return s.mode === 'walk' && !s.mission?.paused && !wrist && !cabin;
}

/**
 * In Plan only the undecided finds: an accepted one is already a numbered waypoint marker there. None while the player is
 * in the habitat's cabin, where their labels, drawn through the walls, would sit on the table prompt (#244).
 * @param {{ mode: string, finds: { list: object[] } }} s the mission store state
 * @param {boolean} cabin the player walks in the cabin
 */
export function findMarkers(s, cabin) {
  if (cabin) return [];
  return s.finds.list
    .filter((f) => s.mode === 'walk' || f.status !== 'accepted')
    .map((f) => ({ id: f.id, label: f.label, x: f.x, z: f.z, status: f.status, verdict: f.detour?.verdict ?? null }));
}
