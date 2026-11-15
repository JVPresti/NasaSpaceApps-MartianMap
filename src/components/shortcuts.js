import { nextLayerIndex } from '../plan/layers.js';
import { setLayer, setMode, setVisorFrame, useMissionStore } from '../state/store.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { action } from '../input/actions.js';

/**
 * Move the data layer by one step, wrapping at both ends. Shared by the L/Shift+L shortcuts and the gamepad
 * bumpers (#101, #103), so both keep the same order and the same store action. At the table every layer takes a
 * turn; in Walk only the layers the ground draws (layers.js WALK_LAYERS), so a key press never picks a table-only
 * layer that would leave the ground plain.
 * @param {number} direction +1 for the next layer, -1 for the previous one
 */
export function cycleLayer(direction) {
  const state = useMissionStore.getState();
  setLayer(nextLayerIndex(state.view.layer, direction, state.mode));
}

/**
 * Interface shortcuts use the same actions as the buttons; the bridge owns engine updates.
 * `onMode` is the mode button's handler (App's handleModeChange, #174): it also requests the Walk pointer lock
 * and respects a pending resume or restart. Without it, M falls back to the store's setMode.
 *
 * @param {KeyboardEvent} event
 * @param {{ onMode?: (mode: 'walk' | 'plan') => unknown }} [options]
 */
export function handleShortcut(event, { onMode = setMode } = {}) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.composedPath?.()[0] ?? event.target;
  if (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"], dialog[open], [aria-modal="true"]')) return;
  if (wristOwnsKeys()) return;

  const state = useMissionStore.getState();
  const is = (id) => action(id).codes.includes(event.code);   // the bindings live in src/input/actions.js (#365)
  if (is('mode')) onMode(state.mode === 'walk' ? 'plan' : 'walk');
  else if (is('layer-next')) cycleLayer(event.shiftKey ? -1 : 1);
  else if (is('visor-frame')) {
    if (state.mode !== 'walk') return;   // the visor frame only shows in Walk (#28)
    setVisorFrame();
  } else if (is('layer-off')) setLayer(0);
  else return;
  event.preventDefault();
}
