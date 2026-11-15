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

/**
 * One held key at a time for the touch bar's hold buttons (Q, #365): press sends keydown once, release sends one keyup
 * and returns true, a second release or a release without a press does nothing.
 * @param {(id: string, type: 'keydown' | 'keyup') => unknown} send
 */
export function holdKey(send) {
  let held = null;
  return {
    press(id) {
      if (held) return false;
      held = id;
      send(id, 'keydown');
      return true;
    },
    release() {
      if (!held) return false;
      const id = held;
      held = null;
      send(id, 'keyup');
      return true;
    },
  };
}
