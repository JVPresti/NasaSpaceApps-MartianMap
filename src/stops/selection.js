// Waypoint selected in Plan mode, by name. Kept out of the mission store: it is interface state for the stop card
// (#66), not a mission value, and docs/STATE_AND_ENGINE.md lists the store's fields.
import { create } from 'zustand';

export const useStopSelection = create(() => ({ waypoint: null }));

/** Select a waypoint by name; selecting the same one again clears the selection. */
export function toggleWaypoint(name) {
  useStopSelection.setState((s) => ({ waypoint: s.waypoint === name ? null : name }));
}

export function clearWaypoint() {
  useStopSelection.setState({ waypoint: null });
}
