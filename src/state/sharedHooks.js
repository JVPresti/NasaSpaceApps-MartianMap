// Hooks for online shared state (#54). The game calls these; src/net/sharedState.js fills them in when the link has
// ?room=. Offline they stay empty, every sample is free and the case is always available, as before online play.
// This file imports nothing, so code outside src/net/ can use it without pulling src/net/ into the main chunk.

let hooks = {};

/**
 * Installs the online hooks. Returns a function that removes them again.
 * @param {{ claimSample?: (claim: { sid: string, kind: string, site: string | null, x: number, z: number }) =>
 *   { ok: boolean, by?: string } | Promise<{ ok: boolean, by?: string }> | null, mayCallCase?: () => boolean }} next
 */
export function installSharedHooks(next) {
  hooks = { ...next };
  const mine = hooks;
  return () => { if (hooks === mine) hooks = {}; };
}

/**
 * Asks whether the player may take a sample. Null means no gate (offline): go ahead at once. Otherwise
 * { ok, by } now, or a promise of it that always settles (src/net/sharedState.js times out after 1.5 s).
 */
export const claimSample = (claim) => (hooks.claimSample ? hooks.claimSample(claim) : null);

/** False while another player holds the tool case (online only). */
export const mayCallCase = () => (hooks.mayCallCase ? hooks.mayCallCase() !== false : true);
