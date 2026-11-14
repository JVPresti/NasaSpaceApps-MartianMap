// One-way loading lifecycle for the engine: status and progress until ready, first error wins,
// and a disposed engine cannot fire callbacks into a React tree that has moved on.

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * @param {{ onStatus?: (text: string) => void, onProgress?: (progress: object) => void, onError?: (error: Error) => void }} callbacks
 */
export function createLoadLifecycle({ onStatus = () => {}, onProgress = () => {}, onError = () => {} } = {}) {
  let closed = false;
  let ready = false;
  let error = null;
  let ratio = 0;
  let emitted = false;

  return {
    get error() { return error; },
    get isReady() { return ready; },
    get isClosed() { return closed; },

    /** Change the human-readable stage while the scene is still loading. */
    status(text) {
      if (closed || error || ready) return false;
      onStatus(text);
      return true;
    },

    /** Monotonic asset progress; ignored once an error or the ready signal has won. */
    progress(next = {}) {
      if (closed || error || ready) return false;
      const value = clamp01(next.ratio);
      if (emitted && value <= ratio) return false;
      emitted = true;
      ratio = Math.max(ratio, value);
      onProgress({ ...next, ratio });
      return true;
    },

    /** First error is final for the loading phase; later boot events cannot overwrite it. */
    fail(cause) {
      if (closed || error) return false;
      error = cause instanceof Error ? cause : new Error(String(cause));
      onError(error);
      return true;
    },

    /** Call only after the first frame has actually been rendered. */
    complete() {
      if (closed || error || ready) return false;
      ready = true;
      return true;
    },

    close() {
      closed = true;
    },
  };
}
