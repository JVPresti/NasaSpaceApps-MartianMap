import { describe, expect, it } from 'vitest';
import { fixed, formatDuration, minutesFixed, planSummary, routeMetrics, ROUTE_SOURCES, waypointKey } from './routePlan.js';

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

describe('route metrics', () => {
  it('splits each summary value from its unit and names its source path', () => {
    const metrics = routeMetrics({
      distanceM: 955, climbM: 25.4, steepestSlopeDeg: 19.6, etaSec: 1170,
      totals: { o2G: 47.2, o2Pct: 6.13, batteryWh: 36.8, batteryPct: 4.91 },
    });
    expect(metrics.map(({ key, value, unit, detail, path }) => [key, value, unit, detail, path])).toEqual([
      ['distance', '0.95', 'km', undefined, 'route.distanceM'],
      ['climb', '+25', 'm', undefined, 'route.climbM'],
      ['steepest', '20', '°', undefined, 'route.steepestSlopeDeg'],
      ['time', '20', 'min', undefined, 'route.etaSec'],
      ['o2', '47', 'g', '6.1 %', 'route.totals.o2G'],
      ['battery', '37', 'Wh', '4.9 %', 'route.totals.batteryWh'],
    ]);
  });

  it('shows a dash, never zero, before the first plan', () => {
    const metrics = routeMetrics({ distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null, totals: null });
    expect(metrics.every((metric) => metric.value === '—' && metric.detail === undefined)).toBe(true);
    expect(metrics.every((metric) => metric.unit)).toBe(true);
  });
});

describe('cost table numbers', () => {
  it('formats fixed values and minutes, with an en dash when unknown', () => {
    expect(fixed(13.24, 1)).toBe('13.2');
    expect(fixed(null)).toBe('–');
    expect(minutesFixed(1338)).toBe('22.3');
    expect(minutesFixed(undefined)).toBe('–');
  });
});
