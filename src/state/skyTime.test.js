import { describe, expect, it } from 'vitest';
import { missionSolarHours } from './skyTime.js';

describe('mission solar hours (#73)', () => {
  it('rebuilds the time to the second from the start time and the elapsed EVA time', () => {
    expect(missionSolarHours({ initialLmst: '17:45', elapsedSec: 0, lmst: '17:45' })).toBe(17.75);
    // 88,775 Earth seconds are one sol: back to the start time
    expect(missionSolarHours({ initialLmst: '17:45', elapsedSec: 88775 })).toBeCloseTo(17.75, 9);
    // 30 Earth minutes move LMST by 29.2 Mars minutes
    expect(missionSolarHours({ initialLmst: '17:45', elapsedSec: 1800 }) - 17.75).toBeCloseTo(1800 * 86400 / 88775 / 3600, 9);
  });

  it('wraps past midnight', () => {
    expect(missionSolarHours({ initialLmst: '23:30', elapsedSec: 3600 })).toBeLessThan(1);
  });

  it('falls back to the published LMST, then to null', () => {
    expect(missionSolarHours({ lmst: '15:20' })).toBeCloseTo(15 + 20 / 60, 9);
    expect(missionSolarHours({ initialLmst: null, elapsedSec: 0, lmst: null })).toBeNull();
    expect(missionSolarHours(null)).toBeNull();
  });
});
