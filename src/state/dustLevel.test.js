import { describe, expect, it } from 'vitest';
import { dustLevelFromTau, TAU_CLEAR, TAU_STORM } from './dustLevel.js';

describe('dustLevelFromTau', () => {
  it('is 0 for a clear Jezero sky and below', () => {
    expect(dustLevelFromTau(TAU_CLEAR)).toBe(0);
    expect(dustLevelFromTau(0)).toBe(0);
  });
  it('is 1 for a global storm like Gale 2018, and above', () => {
    expect(dustLevelFromTau(TAU_STORM)).toBe(1);
    expect(dustLevelFromTau(10.8)).toBe(1);
  });
  it('makes the 2022 Jezero regional storm a light haze', () => {
    expect(dustLevelFromTau(2.0)).toBeCloseTo(0.21, 2);
  });
  it('is linear in between', () => {
    expect(dustLevelFromTau((TAU_CLEAR + TAU_STORM) / 2)).toBeCloseTo(0.5);
  });
  it('treats a missing value as clear', () => {
    expect(dustLevelFromTau(null)).toBe(0);
    expect(dustLevelFromTau(undefined)).toBe(0);
  });
});
