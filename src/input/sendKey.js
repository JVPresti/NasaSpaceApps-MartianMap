// Sends an action's key as the keyboard would (#365). The touch action bar uses it so a tap goes through the very
// handler the key does: the same guards (wrist owns the keys, a dialog is open, the habitat cabin), the same store
// action, nothing duplicated. The event starts at document.body, outside every text field and dialog.
import { action, keyForCode } from './actions.js';

/**
 * @param {string} id action id from src/input/actions.js
 * @param {'keydown' | 'keyup'} [type]
 * @param {{ target?: EventTarget, KeyboardEventClass?: typeof KeyboardEvent }} [options]
 * @returns {KeyboardEvent} the event, after dispatch (defaultPrevented tells whether a handler took it)
 */
export function sendKey(id, type = 'keydown', { target = globalThis.document?.body, KeyboardEventClass = globalThis.KeyboardEvent } = {}) {
  const a = action(id);
  const code = a.codes[0];
  if (!code) throw new Error(`action ${id} has no key`);
  const key = a.keys?.[0] ?? keyForCode(code);
  const event = new KeyboardEventClass(type, { code, key, bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}
