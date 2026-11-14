// Slope grid switch (#50): the G key toggles view.slopeGrid in the mission store, and the bridge (engineBridge.js) passes
// it to engine.setSlopeGrid. A HUD button can call toggleSlopeGrid() too. The engine shows the grid in Walk mode only.
import { useMissionStore } from './store.js';

/** Flips view.slopeGrid. @param {typeof useMissionStore} [store] */
export function toggleSlopeGrid(store = useMissionStore) {
  store.setState((s) => ({ view: { ...s.view, slopeGrid: !s.view.slopeGrid } }));
}

/** True when a key press is meant for a text field, not the game. */
const typing = (e) => {
  const t = e.target;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};

/**
 * Listens for the G key. @param {typeof useMissionStore} [store]
 * @returns {() => void} disconnect
 */
export function connectSlopeGridKey(store = useMissionStore, target = window) {
  const onKey = (e) => {
    if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    toggleSlopeGrid(store);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
