import { describe, expect, it } from 'vitest';
import { MISSING, areaAt, fill, formatNumber } from './data.js';

const plan = { zone: { frames: [{ areaHa: 32.4 }, { areaHa: 30.8 }, { areaHa: 1.1 }] } };

describe('areaAt', () => {
  it('reads a whole frame as stored', () => {
    expect(areaAt(plan, 0)).toBe(32.4);
    expect(areaAt(plan, 2)).toBe(1.1);
  });

  it('blends between frames and clamps outside the clip', () => {
    expect(areaAt(plan, 1.5)).toBeCloseTo(15.95);
    expect(areaAt(plan, -3)).toBe(32.4);
    expect(areaAt(plan, 9)).toBe(1.1);
  });
});

describe('fill', () => {
  const data = { bend: { slopeDeg: 24.6 }, legs: [{ o2G: 14.6, timeMin: 4.5 }], trek: { rmsM: 0.14 } };

  it('rounds by size: 2 decimals under 1, 1 under 10, none above', () => {
    expect(fill('{trek.rmsM}', data)).toBe('0.14');
    expect(fill('{legs.0.timeMin}', data)).toBe('4.5');
    expect(fill('{legs.0.o2G}', data)).toBe('15');
  });

  it('keeps the decimals a template asks for', () => {
    expect(fill('{bend.slopeDeg:1}°', data)).toBe('24.6°');
    expect(fill('{a:1} ha', { a: 14.3 }, 'es')).toBe('14.3 ha');
    expect(formatNumber(1.1, 'en', 1)).toBe('1.1');
  });

  it('shows a missing value as a question mark, never undefined', () => {
    expect(fill('{nope.here} m', data)).toBe(`${MISSING} m`);
  });
});
