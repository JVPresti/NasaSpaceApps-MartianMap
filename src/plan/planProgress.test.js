import { describe, expect, it } from 'vitest';
import { distanceLeft, planLegTo, remainingPlan } from './planProgress.js';

const waypoints = [{ name: 'HAB' }, { name: 'WP3 · Bright Angel outcrop' }, { name: 'Cheyava Falls' }];
const planLegs = [
  { from: 'HAB', to: 'WP3 · Bright Angel outcrop', distanceM: 874, timeSec: 2100, climbM: 20, maxSlopeDeg: 19 },
  { from: 'WP3 · Bright Angel outcrop', to: 'Cheyava Falls', distanceM: 60, timeSec: 1260, climbM: 4, maxSlopeDeg: 12 },
];

describe('the EVA against the plan (A1, Q3)', () => {
  it('finds the planned leg to a stop by its name', () => {
    expect(planLegTo(planLegs, 'Cheyava Falls').distanceM).toBe(60);
    expect(planLegTo(planLegs, 'nowhere')).toBeNull();
    expect(planLegTo(null, 'Cheyava Falls')).toBeNull();
  });

  it('adds up the planned legs to the stops not reached or skipped', () => {
    expect(remainingPlan(planLegs, waypoints, [])).toEqual({ count: 2, distanceM: 934, timeSec: 3360, climbM: 24, steepestDeg: 19 });
    expect(remainingPlan(planLegs, waypoints, ['WP3 · Bright Angel outcrop'])).toMatchObject({ count: 1, distanceM: 60, steepestDeg: 12 });
    expect(remainingPlan(planLegs, waypoints, ['WP3 · Bright Angel outcrop', 'Cheyava Falls'])).toMatchObject({ count: 0, distanceM: 0, steepestDeg: null });
  });

  it('measures what is left of a route from a position on it', () => {
    const path = [[0, 0], [30, 0], [30, 40]];
    expect(distanceLeft(path, { x: 0, z: 0 })).toBe(70);
    expect(distanceLeft(path, { x: 30, z: 10 })).toBe(30);
    expect(distanceLeft(path, { x: 31, z: 40 })).toBe(0);
    expect(distanceLeft(path, null)).toBeNull();
    expect(distanceLeft(null, { x: 0, z: 0 })).toBeNull();
  });
});
