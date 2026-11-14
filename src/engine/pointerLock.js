/**
 * Pointer-lock control for one canvas. Plain JavaScript with an injected document/element, so it can be
 * tested with a small EventTarget fake and stays out of the render loop.
 *
 * It supports both browser generations:
 *   - legacy `element.requestPointerLock()` returning undefined, with `pointerlockchange` / `pointerlockerror`;
 *   - the newer promise-returning form, including a rejection when the gesture or permission is refused.
 *
 * A resolved promise is not success on its own: the request settles `true` only once
 * `document.pointerLockElement` is this element (set by the browser or reported by the change event).
 *
 * One request is in flight at a time; concurrent callers receive the same promise. A request that is
 * abandoned (timeout, failure, release, dispose) can never resume the game by accident: if a late
 * `pointerlockchange` arrives for a lock nobody wants, it is released at once.
 */

/** Watchdog for a browser that never fires either pointer-lock event. */
export const POINTER_LOCK_TIMEOUT_MS = 3000;

/**
 * @param {{
 *   document: Pick<Document, 'pointerLockElement' | 'exitPointerLock' | 'addEventListener' | 'removeEventListener'>,
 *   element: { requestPointerLock?: () => undefined | Promise<unknown> },
 *   onChange?: (locked: boolean) => void,
 *   timeoutMs?: number,
 *   setTimeout?: Function,
 *   clearTimeout?: Function,
 * }} options
 */
export function createPointerLock({
  document: doc,
  element,
  onChange = () => {},
  timeoutMs = POINTER_LOCK_TIMEOUT_MS,
  setTimeout: schedule = setTimeout,
  clearTimeout: cancel = clearTimeout,
} = {}) {
  if (!element) throw new Error('createPointerLock: element is required');
  if (!doc || typeof doc.addEventListener !== 'function') throw new Error('createPointerLock: document is required');

  let disposed = false;
  let lastLocked = false;
  let wanted = false;
  let pending = null;   // { promise, resolve, timer }

  const isLocked = () => doc.pointerLockElement === element;

  function notify(locked) {
    if (locked === lastLocked) return;
    lastLocked = locked;
    try { onChange(locked); } catch { /* a UI callback must not break lock bookkeeping */ }
  }

  function settle(value) {
    if (!pending) return;
    const entry = pending;
    pending = null;
    if (entry.timer !== null) cancel(entry.timer);
    entry.resolve(value);
  }

  function handleChange() {
    if (disposed) return;
    const locked = isLocked();
    if (pending) {
      wanted = locked;
      settle(locked);
    } else if (locked && !wanted) {
      // A lock nobody asked for: a late success after a timeout/failure, or another feature grabbing it.
      // Release it instead of letting a paused game receive mouse movement.
      try { doc.exitPointerLock?.(); } catch { /* ignore */ }
      return;
    }
    notify(locked);
  }

  function handleError() {
    if (disposed) return;
    if (pending) {
      wanted = false;
      settle(false);
    }
    if (lastLocked) {
      wanted = false;
      notify(false);
    }
  }

  doc.addEventListener('pointerlockchange', handleChange);
  doc.addEventListener('pointerlockerror', handleError);

  function request() {
    if (disposed) return Promise.resolve(false);
    if (isLocked()) {
      wanted = true;
      notify(true);
      return Promise.resolve(true);
    }
    if (pending) return pending.promise;
    if (typeof element.requestPointerLock !== 'function') return Promise.resolve(false);

    wanted = true;
    let resolvePending;
    const promise = new Promise((resolve) => { resolvePending = resolve; });
    const entry = { promise, resolve: resolvePending, timer: null };
    pending = entry;

    if (timeoutMs > 0 && typeof schedule === 'function') {
      entry.timer = schedule(() => {
        if (pending !== entry) return;
        wanted = false;
        settle(false);
      }, timeoutMs);
    }

    let returned;
    try {
      returned = element.requestPointerLock();
    } catch {
      wanted = false;
      settle(false);
      return promise;
    }

    if (returned && typeof returned.then === 'function') {
      returned.then(
        () => {
          if (pending !== entry) return;
          // The promise form can resolve before `pointerLockElement` changes; a resolved request is not a
          // real lock. Success is reported only when the element is actually locked, otherwise the pending
          // request waits for its change event (or the watchdog).
          if (!isLocked()) return;
          wanted = true;
          settle(true);
          notify(true);
        },
        () => {
          if (pending !== entry) return;
          wanted = false;
          settle(false);
        },
      );
    }

    return promise;
  }

  function release() {
    if (disposed) return;
    wanted = false;
    if (pending) settle(false);
    try {
      if (isLocked()) doc.exitPointerLock?.();
    } catch { /* release is best effort */ }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    wanted = false;
    settle(false);
    doc.removeEventListener('pointerlockchange', handleChange);
    doc.removeEventListener('pointerlockerror', handleError);
    try {
      if (isLocked()) doc.exitPointerLock?.();
    } catch { /* ignore */ }
  }

  return {
    request,
    release,
    dispose,
    isLocked,
    isWanted: () => wanted,
  };
}
