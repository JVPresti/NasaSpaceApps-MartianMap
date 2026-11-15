import { useSyncExternalStore } from 'react';

// The mission table's sheet on a phone (#365). Below 900 px wide (or under 500 px high) the table stacks: the map on
// top and the step's panels in a sheet under it. The sheet is either 'open' (panels scroll under the map) or 'map'
// (the panels fold away and the map takes the whole body). A tap on a step tab opens the sheet again, since the player
// asked to see that step. Plain JavaScript with a tiny subscribe API, so React reads it with useSyncExternalStore.

export const SHEET = Object.freeze({ OPEN: 'open', MAP: 'map' });

/** @param {string} [initial] */
export function createSheet(initial = SHEET.OPEN) {
  let state = initial === SHEET.MAP ? SHEET.MAP : SHEET.OPEN;
  const listeners = new Set();
  const set = (next) => {
    if (next === state) return;
    state = next;
    listeners.forEach((fn) => fn());
  };
  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    toggle: () => set(state === SHEET.OPEN ? SHEET.MAP : SHEET.OPEN),
    open: () => set(SHEET.OPEN),
    showMap: () => set(SHEET.MAP),
  };
}

/** The one sheet of the app's mission table. */
export const planSheet = createSheet();

/** The sheet state, for the class on PlanMode's wrapper and the toggle's label. */
export function usePlanSheet() {
  return useSyncExternalStore(planSheet.subscribe, planSheet.get, planSheet.get);
}
