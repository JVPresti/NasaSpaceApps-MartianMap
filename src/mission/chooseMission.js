import { setMode, setNeeds, useMissionStore } from '../state/store.js';

/**
 * The start screen's mission choice (#265): set the objective that defines the mission (src/sim/missions.js) and put
 * the astronaut on foot in the habitat, by the mission table (habitat-first flow, #260); "Open plan" at the table opens
 * it on that mission. Before Begin EVA the needs take it; once the EVA has begun they are locked and nothing changes.
 * App resumes the walk after this.
 * @param {string} objective needs.objective: FIRST_OBJECTIVE or FULL_OBJECTIVE
 * @param {typeof useMissionStore} [store]
 * @returns {string} the objective now in the needs
 */
export function chooseMission(objective, store = useMissionStore) {
  setNeeds({ objective });
  if (store.getState().mode !== 'walk') setMode('walk');
  return store.getState().needs.objective;
}
