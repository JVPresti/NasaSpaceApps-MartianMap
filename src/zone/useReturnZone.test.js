import { describe, expect, it } from 'vitest';
import { zoneFrameKey, zoneFramePoints } from './useReturnZone.js';

const zone = (kind, planned, bounds) => ({ kind, inputs: { planned }, stats: { bounds } });

describe('zoneFrameKey', () => {
  it('frames the plan zone in 50 m steps, so a few metres of change keep the view', () => {
    const a = zoneFrameKey(zone('plan', true, { minX: 1.2, minZ: -12, maxX: 611, maxZ: 640 }));
    expect(a).toBe('0,-50,650,650');
    expect(zoneFrameKey(zone('plan', true, { minX: 3, minZ: -20, maxX: 608, maxZ: 645 }))).toBe(a);
    expect(zoneFramePoints(a)).toEqual([{ x: 0, z: -50 }, { x: 650, z: 650 }]);
  });

  it('never frames a live zone or the suit-limit fallback, which covers the whole tile', () => {
    expect(zoneFrameKey(zone('live', true, { minX: 0, minZ: 0, maxX: 600, maxZ: 600 }))).toBe('');
    expect(zoneFrameKey(zone('plan', false, { minX: -711, minZ: -750, maxX: 711, maxZ: 750 }))).toBe('');
    expect(zoneFrameKey(null)).toBe('');
    expect(zoneFramePoints('')).toEqual([]);
  });
});
