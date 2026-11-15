import { LAYERS } from '../plan/layers.js';
import { setLayer, useMissionStore } from '../state/store.js';

/**
 * Move the data layer by one step, wrapping at both ends. Shared by the L/Shift+L shortcuts and the gamepad
 * bumpers (#101, #103), so both keep the same order and the same store action.
 * @param {number} direction +1 for the next layer, -1 for the previous one
 */
export function cycleLayer(direction) {
  const state = useMissionStore.getState();
  const current = LAYERS.findIndex((layer) => layer.index === state.view.layer);
  const next = ((current < 0 ? 0 : current) + (direction < 0 ? -1 : 1) + LAYERS.length) % LAYERS.length;
  setLayer(LAYERS[next].index);
}

/**
 * Data layer shortcuts use the same action as the layer buttons; the bridge owns engine updates.
 * There is no Plan / Walk key any more: the mission table opens with E at the table in the habitat, and Begin EVA
 * goes out through the airlock (habitat-first flow).
 *
 * @param {KeyboardEvent} event
 */
export function handleShortcut(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.composedPath?.()[0] ?? event.target;
  if (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"], dialog[open], [aria-modal="true"]')) return;

  switch (event.code) {
    case 'KeyL':
      cycleLayer(event.shiftKey ? -1 : 1);
      break;
    case 'Digit0':
    case 'Numpad0':
      setLayer(0);
      break;
    default:
      return;
  }
  event.preventDefault();
}
