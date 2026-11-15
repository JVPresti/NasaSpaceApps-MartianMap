// Hooks for the habitat seat (#55). The mission table calls these; src/net/habitat.js fills them in when the link has
// ?room=. Offline they stay empty and every call is a no-op that reports nothing sent.
// This file imports nothing, so code outside src/net/ can use it without pulling src/net/ into the main chunk.

let hooks = {};

/**
 * Installs the online hooks. Returns a function that removes them again.
 * @param {{ sendRoute?: (path: Array<[number, number]>) => number, sendGo?: (go: boolean, why?: string) => boolean,
 *   addNote?: (x: number, z: number, label?: string, kind?: 'note' | 'go') => string | null }} next
 */
export function installHabitatHooks(next) {
  hooks = { ...next };
  const mine = hooks;
  return () => { if (hooks === mine) hooks = {}; };
}

/** Sends the planned path (metres) to the crew. Returns the number of points sent, 0 when nothing went out. */
export const sendHabitatRoute = (path) => (hooks.sendRoute ? hooks.sendRoute(path) : 0);

/** Calls go (true) or no-go (false) with an optional short reason. False when nothing went out. */
export const sendGoCall = (go, why = '') => (hooks.sendGo ? hooks.sendGo(go, why) : false);

/** Drops a note ('note') or a "go here" point ('go') for everyone. Returns the marker's client id, or null. */
export const addHabitatNote = (x, z, label = '', kind = 'note') => (hooks.addNote ? hooks.addNote(x, z, label, kind) : null);
