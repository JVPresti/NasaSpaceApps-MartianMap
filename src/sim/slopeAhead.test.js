import { describe, expect, it } from 'vitest';
import { detourExtra, lookAhead, noGoCells } from './slopeAhead.js';

const flat = () => 0;
const steep = () => 30;

describe('slope look-ahead', () => {
  it('does not warn on flat ground', () => {
    const result = lookAhead({ x: 0, z: 0 }, 0, flat);
    expect(result.blocked).toBe(false);
    expect(result.maxSlopeDeg).toBe(0);
    expect(result.distanceM).toBeNull();
  });

  it('warns before a steep cell and reports its distance', () => {
    const result = lookAhead({ x: 0, z: 0 }, 0, steep);
    expect(result.blocked).toBe(true);
    expect(result.maxSlopeDeg).toBe(30);
    expect(result.distanceM).toBe(2);
  });

  it('clears when the astronaut turns away', () => {
    // The ridge is only north of the player (negative z).
    const ridge = (_x, z) => (z < -4 ? 32 : 0);
    expect(lookAhead({ x: 0, z: 0 }, 0, ridge).blocked).toBe(true);
    expect(lookAhead({ x: 0, z: 0 }, 90, ridge).blocked).toBe(false);
  });
});

describe('no-go cells', () => {
  it('returns only the cells over the limit', () => {
    const cells = noGoCells({ x: 0, z: 0 }, (x) => (x > 0 ? 30 : 5), {
      radiusM: 6,
      cellM: 3,
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.slopeDeg > 25)).toBe(true);
    expect(cells.some((cell) => cell.x <= 0)).toBe(false);
  });

  it('returns an empty array without a position', () => {
    expect(noGoCells(null, steep)).toEqual([]);
  });
});

describe('detour cost', () => {
  it('reports the extra distance and time', () => {
    expect(detourExtra({ distance: 130 }, 100, 1)).toEqual({ addedM: 30, addedSec: 30 });
    expect(detourExtra({ distance: 90 }, 100, 1)).toEqual({ addedM: 0, addedSec: 0 });
  });
});
