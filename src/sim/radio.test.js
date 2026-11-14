import { describe, expect, it } from 'vitest';
import { radioLinkState, radioShadowCells } from './radio.js';

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
