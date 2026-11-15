import { describe, expect, it } from 'vitest';
import { keepWalkProgress } from './useRoutePlanner.js';

describe('keepWalkProgress (R5)', () => {
  const replanned = { path: [[0, 0], [1, 1]], nextIndex: 0, visited: [] };
  const walked = { nextIndex: 2, visited: ['HAB', 'S1 · light-toned patch'] };

  it('keeps the stops reached and the next target when the table re-plans during the EVA', () => {
    expect(keepWalkProgress(replanned, walked, true)).toEqual({ ...replanned, nextIndex: 2, visited: walked.visited });
  });

  it('starts from the airlock before the EVA, and passes no route through', () => {
    expect(keepWalkProgress(replanned, walked, false)).toBe(replanned);
    expect(keepWalkProgress(null, walked, true)).toBeNull();
  });
});
