/**
 * Key state for the walk input. A gate exists so a menu can disable gameplay input without
 * leaving a key stuck down: disabling clears every key, and key-up is still recorded while the
 * gate is closed. Plain JavaScript, no DOM: the caller feeds key codes from its own listeners.
 */

/**
 * @param {{ enabled?: boolean }} [options] input starts enabled by default, matching the engine
 * @returns {{
 *   keys: Record<string, boolean>,
 *   isEnabled: () => boolean,
 *   setEnabled: (enabled: boolean) => boolean,
 *   keyDown: (code: string) => boolean,
 *   keyUp: (code: string) => boolean,
 *   clear: () => void,
 *   isDown: (code: string) => boolean,
 * }}
 */
export function createInputGate({ enabled = true } = {}) {
  const keys = Object.create(null);
  let open = false;

  function clear() {
    for (const code of Object.keys(keys)) keys[code] = false;
  }

  const gate = {
    keys,
    isEnabled: () => open,
    setEnabled(value) {
      open = value === true;
      if (!open) clear();
      return open;
    },
    /** @returns {boolean} true when the key was accepted */
    keyDown(code) {
      if (!open || typeof code !== 'string' || code === '') return false;
      keys[code] = true;
      return true;
    },
    /** Always accepted: a key that went down before a pause must still go up cleanly. */
    keyUp(code) {
      if (typeof code !== 'string' || code === '') return false;
      keys[code] = false;
      return true;
    },
    clear,
    isDown: (code) => keys[code] === true,
  };

  gate.setEnabled(enabled === true);
  return gate;
}
