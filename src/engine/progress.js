// File-based loading progress with a denominator known before the first request starts.
// The bar can therefore rise through staged batches (JSON, textures, models) without ever falling.

/**
 * @param {{ expected?: string[], onChange?: (progress: { loaded: number, failed: number, total: number, ratio: number }) => void }} options
 */
export function createProgressTracker({ expected = [], onChange = () => {} } = {}) {
  const states = new Map();
  let loaded = 0;
  let failed = 0;
  let ratio = 0;
  let emitted = false;

  function emit(force = false) {
    const total = states.size;
    const next = total ? loaded / total : 0;
    if (!force && emitted && next <= ratio) return;
    emitted = true;
    ratio = Math.max(ratio, next);
    onChange({ loaded, failed, total, ratio });
  }

  function expect(paths) {
    for (const path of [].concat(paths)) {
      if (typeof path === 'string' && path && !states.has(path)) states.set(path, 'pending');
    }
  }

  function begin(path) {
    if (!states.has(path)) states.set(path, 'loading');
    else if (states.get(path) === 'pending') states.set(path, 'loading');
    emit();
  }

  function complete(path) {
    const state = states.get(path);
    if (state === 'done' || state === 'failed') return;
    if (!states.has(path)) states.set(path, 'loading');
    states.set(path, 'done');
    loaded++;
    emit();
  }

  function fail(path) {
    const state = states.get(path);
    if (state === 'done' || state === 'failed') return;
    if (!states.has(path)) states.set(path, 'loading');
    states.set(path, 'failed');
    failed++;
    emit(true);
  }

  function snapshot() {
    return { loaded, failed, total: states.size, ratio };
  }

  expect(expected);
  emit(true);

  return { expect, begin, complete, fail, snapshot };
}
