import { describe, expect, it } from 'vitest';
import { createProgressTracker } from './progress.js';

describe('createProgressTracker', () => {
  it('starts at zero out of the full manifest and counts real files', () => {
    const updates = [];
    const tracker = createProgressTracker({ expected: ['a', 'b', 'c', 'd'], onChange: (p) => updates.push(p) });

    expect(updates[0]).toMatchObject({ loaded: 0, failed: 0, total: 4, ratio: 0 });

    tracker.begin('a');
    tracker.complete('a');
    expect(updates.at(-1)).toMatchObject({ loaded: 1, failed: 0, total: 4, ratio: 0.25 });

    tracker.begin('b');
    tracker.complete('b');
    expect(updates.at(-1)).toMatchObject({ loaded: 2, failed: 0, total: 4, ratio: 0.5 });
  });

  it('never moves backwards when a late asset joins the total', () => {
    const updates = [];
    const tracker = createProgressTracker({ expected: ['a', 'b', 'c', 'd'], onChange: (p) => updates.push(p) });
    tracker.begin('a');
    tracker.complete('a');
    tracker.begin('b');
    tracker.complete('b');
    expect(updates.at(-1).ratio).toBe(0.5);

    // An auto-tier texture can appear after boot, but progress already shown must not fall.
    tracker.expect(['late']);
    expect(tracker.snapshot()).toMatchObject({ loaded: 2, total: 5, ratio: 0.5 });

    tracker.begin('c');
    tracker.complete('c');
    expect(updates.at(-1).ratio).toBe(0.6);
  });

  it('counts each file once even if a loader settles it twice', () => {
    const tracker = createProgressTracker({ expected: ['a'] });
    tracker.begin('a');
    tracker.complete('a');
    tracker.complete('a');
    expect(tracker.snapshot()).toMatchObject({ loaded: 1, total: 1, ratio: 1 });
  });

  it('reports a failed file separately from loaded files', () => {
    const updates = [];
    const tracker = createProgressTracker({ expected: ['a', 'b'], onChange: (p) => updates.push(p) });
    tracker.begin('a');
    tracker.fail('a');

    expect(updates.at(-1)).toMatchObject({ loaded: 0, failed: 1, total: 2, ratio: 0 });
    expect(tracker.snapshot()).toMatchObject({ loaded: 0, failed: 1, total: 2 });
  });
});
