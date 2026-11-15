import { describe, expect, it } from 'vitest';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { slopeClass as slopeGridClass } from '../engine/slopeGridRules.js';
import { SLOPE_CAUTION_DEG, SLOPE_NO_GO_DEG, buildProfile, positionAlongPath, slopeClass } from './profile.js';

const PATH = [[0, 0], [100, 0]];
const heightRamp = (x) => x / 10;

describe('elevation profile', () => {
  it('samples the path, heights and slope class', () => {
    const profile = buildProfile(PATH, [{ name: 'WP1' }, { name: 'WP2' }], heightRamp, {
      stepM: 10,
      slopeAt: () => 20,
    });
    expect(profile.totalM).toBeCloseTo(100, 6);
    expect(profile.samples).toHaveLength(11);
    expect(profile.minHeightM).toBeCloseTo(0, 6);
    expect(profile.maxHeightM).toBeCloseTo(10, 6);
    expect(profile.samples[0].slopeDeg).toBe(20);
    expect(slopeClass(profile.samples[0].slopeDeg)).toBe('caution');
  });

  it('falls back to the height gradient when no slope query is supplied', () => {
    const profile = buildProfile(PATH, [], heightRamp, { stepM: 10 });
    expect(profile.samples[5].slopeDeg).toBeCloseTo(Math.atan2(2, 20) * 180 / Math.PI, 2);
  });

  it('places waypoints and the current position by distance along the route', () => {
    const profile = buildProfile(PATH, [{ name: 'mid', x: 50, z: 0 }], heightRamp, {
      stepM: 10,
      position: { x: 25, z: 8 },
    });
    expect(profile.waypoints[0].distanceM).toBeCloseTo(50, 6);
    expect(profile.positionM).toBeCloseTo(25, 6);
    const position = positionAlongPath(PATH, { x: 25, z: 8 });
    expect(position.distanceM).toBeCloseTo(25, 6);
    expect(position.rangeM).toBeCloseTo(8, 6);
  });

  it('uses the three slope classes', () => {
    expect(slopeClass(10)).toBe('ok');
    expect(slopeClass(15)).toBe('ok');
    expect(slopeClass(20)).toBe('caution');
    expect(slopeClass(22)).toBe('nogo');
    expect(slopeClass(25)).toBe('nogo');
  });

  it('turns amber and red at the planner\'s limits, like the slope layer (#293)', () => {
    expect(SLOPE_NO_GO_DEG).toBe(COST_CONSTANTS.SLOPE_LIMIT_DEG);
    expect(SLOPE_CAUTION_DEG).toBe(COST_CONSTANTS.SLOPE_CAUTION_DEG);
    expect(slopeClass(COST_CONSTANTS.SLOPE_LIMIT_DEG)).toBe('caution');
    expect(slopeClass(COST_CONSTANTS.SLOPE_LIMIT_DEG + 0.1)).toBe('nogo');
    expect(slopeClass(COST_CONSTANTS.SLOPE_CAUTION_DEG)).toBe('ok');
    expect(slopeClass(COST_CONSTANTS.SLOPE_CAUTION_DEG + 0.1)).toBe('caution');
    for (let deg = 0; deg <= 40; deg += 0.5) expect(slopeClass(deg)).toBe(slopeGridClass(deg));
  });

  it('returns null without a usable path', () => {
    expect(buildProfile(null, [], heightRamp)).toBeNull();
    expect(buildProfile([[0, 0]], [], heightRamp)).toBeNull();
    expect(buildProfile(PATH, [], null)).toBeNull();
  });
});
