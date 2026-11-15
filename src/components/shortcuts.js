import { LAYERS } from '../plan/layers.js';
import { setLayer, useMissionStore } from '../state/store.js';

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

  const state = useMissionStore.getState();
  switch (event.code) {
    case 'KeyL': {
      const current = LAYERS.findIndex((layer) => layer.index === state.view.layer);
      const next = ((current < 0 ? 0 : current) + (event.shiftKey ? -1 : 1) + LAYERS.length) % LAYERS.length;
      setLayer(LAYERS[next].index);
      break;
    }
    case 'Digit0':
    case 'Numpad0':
      setLayer(0);
      break;
    default:
      return;
  }
  event.preventDefault();
}
