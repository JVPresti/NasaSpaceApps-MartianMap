// Redraw budget for the minimap canvas (#60): store updates, the ortho photo load and resizes all go
// through one scheduler, so the canvas is painted at most 10 times per second. The first request draws
// immediately; later requests inside the 100 ms window are coalesced into the next allowed frame.
// Plain JavaScript, no React, no DOM.

export const MINIMAP_MAX_REDRAWS_PER_SECOND = 10;

/**
 * @param {{
 *   draw: (info: { index: number, atMs: number, reason: string }) => void,
 *   maxPerSecond?: number,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, delayMs: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 * }} options
 */
export function createRedrawScheduler({
  draw,
  maxPerSecond = MINIMAP_MAX_REDRAWS_PER_SECOND,
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  if (typeof draw !== 'function') throw new Error('createRedrawScheduler: draw must be a function');
  if (!(maxPerSecond > 0)) throw new Error('createRedrawScheduler: maxPerSecond must be greater than 0');
  const intervalMs = 1000 / maxPerSecond;
  let lastAt = null;
  let timer = null;
  let disposed = false;
  let count = 0;
  let pendingReason = '';

  function pump() {
    if (disposed) return;
    const at = now();
    const wait = lastAt === null ? 0 : lastAt + intervalMs - at;
    if (wait > 0) {
      timer = setTimer(pump, wait);
      return;
    }
    timer = null;
    lastAt = at;
    count += 1;
    const reason = pendingReason || 'request';
    pendingReason = '';
    draw({ index: count, atMs: at, reason });
  }

  return {
    /** Ask for a paint. Returns true when the paint happened synchronously. */
    request(reason = 'request') {
      if (disposed) return false;
      pendingReason = reason;
      if (timer !== null) return false;
      const at = now();
      if (lastAt !== null && at - lastAt < intervalMs) {
        timer = setTimer(pump, intervalMs - (at - lastAt));
        return false;
      }
      pump();
      return true;
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      pendingReason = '';
    },
    get count() {
      return count;
    },
    get disposed() {
      return disposed;
    },
  };
}
