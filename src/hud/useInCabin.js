// Whether the player walks in the habitat's cabin, for the HUD items that give way to the table prompt there (#244):
// the find card (src/finds/Finds.jsx) and the next-waypoint panel and marker (Hud.jsx). The engine answers
// (engine.inHabitatCabin, through tableActions.js inCabin); it is read again on every store change, and the bridge
// writes the player's position to the store as they move, so walking in or out of the cabin is seen at once.
import { useCallback, useSyncExternalStore } from 'react';
import { useMissionStore } from '../state/store.js';
import { inCabin } from '../state/tableActions.js';

/** @param {{ inHabitatCabin?: () => boolean } | null | undefined} engine @returns {boolean} */
export function useInCabin(engine) {
  const read = useCallback(() => inCabin(engine), [engine]);
  return useSyncExternalStore(useMissionStore.subscribe, read, read);
}
