import { LAYERS } from '../plan/layers.js';
import { setLayer, setMode, useMissionStore } from '../state/store.js';

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

  const state = useMissionStore.getState();
  switch (event.code) {
    case 'KeyM':
      onMode(state.mode === 'walk' ? 'plan' : 'walk');
      break;
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
