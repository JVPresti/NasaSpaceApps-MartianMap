import { describe, expect, it } from 'vitest';
import { createHeightQueries } from '../engine/queries.js';
import { gridLineOfSight, inRadioShadow, radioLinkState, radioShadowAlongPath, radioShadowCells, radioShadowMask } from './radio.js';

const mast = { x: 535.1, y: 10, z: 574.1 };

describe('radio link state', () => {
  it('is linked in line of sight and weak at long range', () => {
    expect(radioLinkState({ point: { x: 435.1, z: 574.1 }, mast, lineOfSight: () => ({ clear: true }) }).state).toBe('linked');
    expect(radioLinkState({
      point: { x: -300, z: 0 },
      mast,
      lineOfSight: () => ({ clear: true }),
    }).state).toBe('weak');
  });

  it('is lost when a ridge blocks the line', () => {
    const result = radioLinkState({
      point: { x: 0, z: 0 },
      mast,
      lineOfSight: () => ({ clear: false }),
    });
    expect(result.state).toBe('lost');
    expect(result.clear).toBe(false);
    expect(result.rangeM).toBeGreaterThan(0);
  });

  it('is lost without a position or mast', () => {
    expect(radioLinkState({ point: null, mast, lineOfSight: () => ({ clear: true }) }).state).toBe('lost');
    expect(radioLinkState({ point: { x: 0, z: 0 }, mast: null, lineOfSight: () => ({ clear: true }) }).state).toBe('lost');
  });
});

describe('radio shadow cells', () => {
  it('keeps only the points where the line of sight is blocked', () => {
    const cells = radioShadowCells({
      mast,
      stepM: 100,
      widthM: 400,
      depthM: 400,
      lineOfSight: (point) => ({ clear: point.x > 0 }),
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.x <= 0)).toBe(true);
  });

  it('returns an empty list without a mast', () => {
    expect(radioShadowCells({ mast: null, lineOfSight: () => ({ clear: false }) })).toEqual([]);
  });
});

/** A 100 m square, 2 m grid, flat but for a ridge `height` metres high along x = 0 (columns 24 to 26). */
function ridgeGrid(height = 6) {
  const n = 51;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) for (let i = 24; i <= 26; i += 1) heights[j * n + i] = height;
  return { n, width: 100, depth: 100, heights };
}

describe('line of sight on the planner grid (#245)', () => {
  const grid = ridgeGrid();
  const mast = { x: -40, y: 4, z: 0 };   // west of the ridge, 4 m up

  it('is clear on the mast side and blocked behind the ridge', () => {
    expect(gridLineOfSight(grid, { x: -20, z: 10 }, mast)).toBe(true);
    expect(gridLineOfSight(grid, { x: 20, z: 0 }, mast)).toBe(false);
  });

  it('agrees with the engine line of sight inside the tile', () => {
    const engine = createHeightQueries({ n: grid.n, W: grid.width, H: grid.depth, h: grid.heights });
    for (const point of [{ x: -30, z: -30 }, { x: 10, z: 5 }, { x: 45, z: 40 }, { x: -2, z: 0 }]) {
      expect(gridLineOfSight(grid, point, mast)).toBe(engine.lineOfSight(point, mast).clear);
    }
  });

  it('masks the ground behind the ridge', () => {
    const mask = radioShadowMask(grid, mast, 10);
    expect(mask.cols).toBe(11);
    expect(inRadioShadow(mask, -30, 0)).toBe(false);
    expect(inRadioShadow(mask, 30, 0)).toBe(true);
    expect(inRadioShadow(mask, 400, 0)).toBe(true);   // outside the mask: the nearest edge cell
    expect(radioShadowMask(grid, null)).toBeNull();
  });

  it('measures the share of a route out of contact and the longest stretch without it', () => {
    const across = radioShadowAlongPath(grid, [[-40, 10], [40, 10]], mast, 2);
    expect(across.lengthM).toBeCloseTo(80, 6);
    expect(across.share).toBeGreaterThan(0.4);
    expect(across.share).toBeLessThan(0.6);
    expect(across.longestM).toBeCloseTo(across.shadowM, 6);   // one stretch, from the ridge to the end
    const back = radioShadowAlongPath(grid, [[-40, 10], [40, 10], [-40, -10]], mast, 2);
    expect(back.longestM).toBeGreaterThan(across.longestM);   // out and back behind the ridge without contact
    expect(radioShadowAlongPath(grid, [[-40, 10], [-20, 10]], mast).share).toBe(0);
    expect(radioShadowAlongPath(grid, [[0, 0]], mast)).toBeNull();
  });
});
