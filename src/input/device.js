// What kind of pointer the device has, and the full screen switch (#365). Media queries only, never the user agent:
// a touchscreen laptop with a mouse reports `any-pointer: fine` and keeps the desktop behaviour.

/** @param {{ matchMedia?: (q: string) => { matches: boolean } } | undefined} [win] */
function query(win, q) {
  try { return !!win?.matchMedia?.(q).matches; } catch { return false; }
}

/**
 * True when every pointer is coarse: a phone or a tablet without a mouse or a trackpad. Such a device has no pointer
 * lock to capture, so the app starts with drag-to-look instead of asking the browser for a lock it cannot give.
 * @param {Window | undefined} [win]
 */
export function touchOnly(win = globalThis.window) {
  return query(win, '(pointer: coarse)') && !query(win, '(any-pointer: fine)');
}

/** True when the primary pointer is coarse (the touch action bar shows even if a mouse is also attached). */
export function coarsePointer(win = globalThis.window) {
  return query(win, '(pointer: coarse)');
}

/**
 * Full screen state and switch. iPhone Safari has no element full screen (only video), so `available` is false there
 * and the button hides; adding the page to the home screen gives a full screen app instead.
 * @param {Document | undefined} [doc]
 */
export function fullscreen(doc = globalThis.document) {
  const el = doc?.documentElement;
  const request = el && (el.requestFullscreen || el.webkitRequestFullscreen);
  const exit = doc && (doc.exitFullscreen || doc.webkitExitFullscreen);
  const current = () => !!(doc && (doc.fullscreenElement || doc.webkitFullscreenElement));
  return {
    available: typeof request === 'function' && doc?.fullscreenEnabled !== false,
    active: current,
    /** @returns {Promise<boolean>} true when the page is full screen afterwards */
    async toggle() {
      try {
        if (current()) await exit.call(doc);
        else await request.call(el, { navigationUI: 'hide' });
      } catch { /* the browser refused; nothing else to do */ }
      return current();
    },
  };
}
