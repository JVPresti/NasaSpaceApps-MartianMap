import { describe, expect, it } from 'vitest';
import { formatDuration, planSummary, ROUTE_SOURCES, waypointKey } from './routePlan.js';

describe('waypoint key', () => {
  it('ignores sub-metre changes and object identity', () => {
    const a = [{ name: 'HAB', x: 520.1, z: 599.9 }];
    const b = [{ name: 'HAB', x: 520.4, z: 600.2 }];
    expect(waypointKey(a)).toBe(waypointKey(b));
  });

  it('changes when a waypoint moves a metre or is renamed', () => {
    expect(waypointKey([{ name: 'HAB', x: 520, z: 600 }])).not.toBe(
      waypointKey([{ name: 'HAB', x: 521, z: 600 }]),
    );
    expect(waypointKey([{ name: 'HAB', x: 520, z: 600 }])).not.toBe(
      waypointKey([{ name: 'WP1', x: 520, z: 600 }]),
    );
  });
});

describe('route summary', () => {
  it('formats distance, climb, slope and time', () => {
    expect(planSummary({ distanceM: 921.7, climbM: 26.9, steepestSlopeDeg: 24.9, etaSec: 900 })).toEqual({
      distance: '0.92 km',
      climb: '+27 m',
      steepest: '25°',
      eta: '15 min',
    });
  });

  it('shows a dash for unknown values', () => {
    expect(planSummary({})).toEqual({ distance: '—', climb: '—', steepest: '—', eta: '—' });
  });

  it('rounds short and long durations', () => {
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(59)).toBe('1 min');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3900)).toBe('1 h 5 min');
    expect(formatDuration(null)).toBe('—');
  });

  it('tags every route value with its source', () => {
    for (const value of Object.values(ROUTE_SOURCES)) {
      expect(value.tag).toBe('DERIVED');
      expect(value.source).toMatch(/A\*|suit model/);
    }
  });
});
