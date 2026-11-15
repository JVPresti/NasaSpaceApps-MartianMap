/**
 * Boots online play from the link. Without ?room= this module does nothing, and src/net/ is never loaded:
 * the only way in is the dynamic import() below, so Vite keeps src/net/ in its own chunk.
 *
 * It must not import anything from src/net/. The room code pattern is a copy of ROOM_CODE_PATTERN in
 * src/net/protocol.js; src/net/onlineLink.test.js checks that the two stay equal.
 */
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

/** Reads ?room= from a query string: { code } for a valid code, { invalid } for a bad one, null without it. */
export function readRoomCode(search) {
  const raw = new URLSearchParams(search || '').get('room');
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? { code } : { invalid: raw };
}

const loadNet = () => import('./net/index.js');

/**
 * Starts online play when the link has a valid room code. Returns the promise of the online handle, or null
 * when the app stays offline. An invalid code only logs a warning for now; the join screen will show it.
 */
export function bootOnline({ search = globalThis.location?.search, store, load = loadNet, warn = console.warn } = {}) {
  const link = readRoomCode(search);
  if (!link) return null;
  if (!link.code) {
    warn('online: ignoring ?room=' + link.invalid + ': a room code is four letters A to Z without I and O');
    return null;
  }
  // TEMPORARY (#55): until the join panel's role choice lands, a dev build takes ?role=habitat so the habitat seat can be
  // tested. Production builds drop this branch (import.meta.env.DEV is false there).
  const role = import.meta.env.DEV && new URLSearchParams(search || '').get('role') === 'habitat' ? 'habitat' : undefined;
  return load().then((net) => net.startOnline({ code: link.code, store, ...(role ? { role } : {}) }));
}
