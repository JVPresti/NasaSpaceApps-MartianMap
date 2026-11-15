// The one suit figure of the session (#305). SuitFigure.jsx makes it on the first Suit step and moves its canvas back in
// on later steps. A figure that can no longer draw is dropped, so the next Suit step makes a new one. That covers a
// failed model download, a lost WebGL context (a GPU reset, a backgrounded tab on iOS, the browser's context limit) and
// a Vite hot reload of the module.

let cached = null;

/**
 * The cached figure, or a new one from `create` when there is none.
 * @template T
 * @param {() => T} create
 * @returns {T}
 */
export function acquireFigure(create) {
  cached ??= create();
  return cached;
}

/** Forget `figure` if it is the cached one; the next acquireFigure makes a new figure. Returns true when dropped. */
export function dropFigure(figure) {
  if (!figure || cached !== figure) return false;
  cached = null;
  return true;
}

/** The cached figure without making one (tests and the hot reload). */
export function cachedFigure() {
  return cached;
}
