// Slope grid switch (#50): the G key toggles view.slopeGrid in the mission store, and the bridge (engineBridge.js) passes
// it to engine.setSlopeGrid. A HUD button can call toggleSlopeGrid() too. The engine shows the grid in Walk mode only.
import { useMissionStore } from './store.js';
import { codeOf } from '../input/actions.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';

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
    if (e.code !== codeOf('slope-grid') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e) || wristOwnsKeys()) return;
    if ((store.getState().stage ?? 'eva') !== 'eva') return;   // the grid is for the ground outside, not the habitat floor
    toggleSlopeGrid(store);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
