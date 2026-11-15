// The find markers the scene shows (engine.setFinds, src/engine/finds.js), from the store's finds. Plain JavaScript.

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
