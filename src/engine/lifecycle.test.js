import { describe, expect, it, vi } from 'vitest';
import { createLoadLifecycle } from './lifecycle.js';

function setup() {
  const events = { statuses: [], progress: [], errors: [] };
  const lifecycle = createLoadLifecycle({
    onStatus: (text) => events.statuses.push(text),
    onProgress: (progress) => events.progress.push(progress),
    onError: (error) => events.errors.push(error),
  });
  return { lifecycle, events };
}

describe('createLoadLifecycle', () => {
  it('keeps progress monotonic while loading', () => {
    const { lifecycle, events } = setup();
    lifecycle.progress({ loaded: 2, total: 10, ratio: 0.2 });
    lifecycle.progress({ loaded: 1, total: 10, ratio: 0.1 });
    lifecycle.progress({ loaded: 4, total: 10, ratio: 0.4 });

    expect(events.progress.map((p) => p.ratio)).toEqual([0.2, 0.4]);
  });

  it('lets the first error win over later status, progress and ready', () => {
    const { lifecycle, events } = setup();
    const error = new Error('assets/terrain.json failed');

    expect(lifecycle.status('Loading textures…')).toBe(true);
    expect(lifecycle.fail(error)).toBe(true);
    expect(lifecycle.fail(new Error('second error'))).toBe(false);
    expect(lifecycle.status('Loading habitat…')).toBe(false);
    expect(lifecycle.progress({ loaded: 39, total: 39, ratio: 1 })).toBe(false);
    expect(lifecycle.complete()).toBe(false);

    expect(events.errors).toEqual([error]);
    expect(events.statuses).toEqual(['Loading textures…']);
    expect(events.progress).toEqual([]);
    expect(lifecycle.error).toBe(error);
    expect(lifecycle.isReady).toBe(false);
  });

  it('only becomes ready when complete is called, and only once', () => {
    const { lifecycle } = setup();
    expect(lifecycle.isReady).toBe(false);
    expect(lifecycle.complete()).toBe(true);
    expect(lifecycle.isReady).toBe(true);
    expect(lifecycle.complete()).toBe(false);
    expect(lifecycle.status('too late')).toBe(false);
    expect(lifecycle.progress({ ratio: 0.9 })).toBe(false);
  });

  it('suppresses every callback after dispose', () => {
    const { lifecycle, events } = setup();
    const onFail = vi.fn();
    lifecycle.close();

    expect(lifecycle.status('after dispose')).toBe(false);
    expect(lifecycle.progress({ ratio: 0.5 })).toBe(false);
    expect(lifecycle.complete()).toBe(false);
    expect(lifecycle.fail(new Error('late'))).toBe(false);
    expect(onFail).not.toHaveBeenCalled();
    expect(events.statuses).toEqual([]);
    expect(events.progress).toEqual([]);
    expect(events.errors).toEqual([]);
  });
});
