import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireFigure, cachedFigure, dropFigure } from './suitFigureCache.js';

afterEach(() => dropFigure(cachedFigure()));

describe('suit figure cache', () => {
  it('makes the figure on the first Suit step and reuses it on the second', () => {
    const create = vi.fn(() => ({ id: 1 }));
    const first = acquireFigure(create);
    const second = acquireFigure(create);
    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('makes a new figure after the old one is dropped (lost context, failed download, hot reload)', () => {
    const first = acquireFigure(() => ({ id: 1 }));
    expect(dropFigure(first)).toBe(true);
    expect(cachedFigure()).toBeNull();
    const second = acquireFigure(() => ({ id: 2 }));
    expect(second).not.toBe(first);
    expect(second.id).toBe(2);
  });

  it('ignores a drop of a figure that is no longer the cached one', () => {
    const stale = acquireFigure(() => ({ id: 1 }));
    dropFigure(stale);
    const fresh = acquireFigure(() => ({ id: 2 }));
    expect(dropFigure(stale)).toBe(false);
    expect(cachedFigure()).toBe(fresh);
  });
});
