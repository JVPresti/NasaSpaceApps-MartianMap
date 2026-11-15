/**
 * Quality changes are asynchronous: High and Low load a different ortho texture before the scene is rebuilt.
 * This controller serialises them and coalesces rapid clicks, so two requests can never interleave and leave
 * the engine on a half-applied tier.
 *
 * `auto` means "use the tier detected at boot and keep the existing slow-frame downgrade". Selecting High or
 * Low turns the automatic downgrade off, exactly like the previous ?tier= override.
 *
 * Plain JavaScript: `apply` is the engine's real setTier, `detect` is detectTier's result.
 */

export const QUALITY_OPTIONS = Object.freeze(['auto', 'high', 'low']);

export function assertQualityOption(option) {
  if (!QUALITY_OPTIONS.includes(option)) {
    throw new Error('quality must be one of ' + QUALITY_OPTIONS.join(', ') + ', got ' + option);
  }
  return option;
}

/**
 * @param {{
 *   apply: (tier: 'high' | 'low') => Promise<void>,
 *   detect?: () => 'high' | 'low',
 *   initialTier?: 'high' | 'low',
 *   initialAuto?: boolean,
 *   onError?: (error: Error) => void,
 * }} options
 * @returns {{
 *   request: (option: 'auto' | 'high' | 'low') => Promise<{tier: string, auto: boolean, pending: boolean, error: string | null}>,
 *   degrade: (tier?: 'high' | 'low') => Promise<object>,
 *   get: () => {tier: string, auto: boolean, pending: boolean, error: string | null},
 *   dispose: () => void,
 * }}
 */
export function createQualityController({
  apply,
  detect = () => 'high',
  initialTier = 'high',
  initialAuto = true,
  onError = () => {},
} = {}) {
  if (typeof apply !== 'function') throw new Error('createQualityController: apply is required');
  if (typeof detect !== 'function') throw new Error('createQualityController: detect must be a function');

  let state = { tier: initialTier, auto: initialAuto };
  let desired = null;        // { target: 'high' | 'low', auto: boolean }
  let running = null;
  let waiters = [];
  let lastError = null;
  let closed = false;

  function snapshot() {
    return {
      tier: state.tier,
      auto: state.auto,
      pending: running !== null || desired !== null,
      error: lastError === null ? null : (lastError.message || String(lastError)),
    };
  }

  function settleWaiters(extra = {}) {
    const result = { ...snapshot(), ...extra };
    const list = waiters;
    waiters = [];
    for (const resolve of list) resolve(result);
  }

  function pump() {
    if (closed || running !== null || desired === null) return;
    const request = desired;
    desired = null;
    running = (async () => {
      try {
        await apply(request.target);
        if (closed) return;
        state = { tier: request.target, auto: request.auto };
        lastError = null;
      } catch (cause) {
        lastError = cause instanceof Error ? cause : new Error(String(cause));
        try { onError(lastError); } catch { /* reporting must not break the queue */ }
      } finally {
        running = null;
        if (closed) {
          settleWaiters({ pending: false });
        } else if (desired !== null) {
          pump();
        } else {
          settleWaiters();
        }
      }
    })();
  }

  function enqueue(target, auto) {
    if (closed) return Promise.resolve({ ...snapshot(), pending: false, error: 'engine disposed' });
    desired = { target, auto };
    const promise = new Promise((resolve) => waiters.push(resolve));
    pump();
    return promise;
  }

  function request(option) {
    assertQualityOption(option);
    // A manual choice takes ownership immediately, so the automatic downgrade cannot queue behind it.
    state = { ...state, auto: option === 'auto' };
    let target;
    try {
      target = option === 'auto' ? detect() : option;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      lastError = error;
      try { onError(error); } catch { /* ignore */ }
      return Promise.resolve({ ...snapshot(), pending: false });
    }
    return enqueue(target, option === 'auto');
  }

  /** The frame loop's automatic downgrade. It only acts while Auto is in charge. */
  function degrade(tier = 'low') {
    if (closed || !state.auto) return Promise.resolve(snapshot());
    // Take Auto out of charge before the attempt: a failed optional texture download must not retry
    // every few seconds, and the current scene stays as it is.
    state = { ...state, auto: false };
    return enqueue(tier, false);
  }

  function dispose() {
    if (closed) return;
    closed = true;
    desired = null;
    settleWaiters({ pending: false, error: 'engine disposed' });
  }

  return {
    request,
    degrade,
    get: snapshot,
    dispose,
  };
}
