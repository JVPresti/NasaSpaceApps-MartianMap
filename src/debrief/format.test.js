import { describe, expect, it } from 'vitest';
import {
  buildMissionLog,
  formatDistance,
  formatDose,
  formatDuration,
  formatMissionTime,
  formatPercent,
  formatMinutes,
  formatSamples,
  formatSignedDelta,
  formatSignedGrams,
  formatSignedMetres,
  formatSignedMinutes,
  routeDistanceChange,
  routeKindLabel,
  waypointCode,
} from './format.js';

describe('debrief formats', () => {
  it('shows distance in metres below a kilometre and in kilometres above it', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(850.4)).toBe('850 m');
    expect(formatDistance(999.6)).toBe('1.00 km');
    expect(formatDistance(1240)).toBe('1.24 km');
    expect(formatDistance(null)).toBe('—');
  });

  it('shows the time outside in readable hours, minutes and seconds', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(750)).toBe('12 min 30 s');
    expect(formatDuration(1800)).toBe('30 min');
    expect(formatDuration(4320)).toBe('1 h 12 min');
    expect(formatDuration(null)).toBe('—');
  });

  it('keeps mission time and signed oxygen minutes unambiguous', () => {
    expect(formatMissionTime(3725)).toBe('T+1:02:05');
    expect(formatMissionTime(null)).toBe('—');
    expect(formatSignedMinutes(2520)).toBe('+42 min');
    expect(formatSignedMinutes(-180)).toBe('-3 min');
    expect(formatSignedMinutes(-30)).toBe('-1 min');
    expect(formatSignedMinutes(0)).toBe('0 min');
    expect(formatSignedMinutes(null)).toBe('—');
  });

  it('uses a dash for unknown battery, dose and sample counts', () => {
    expect(formatPercent(76.4)).toBe('76 %');
    expect(formatPercent(null)).toBe('—');
    expect(formatDose(4.7)).toBe('4.70 µGy');
    expect(formatDose(12.34)).toBe('12.3 µGy');
    expect(formatDose(0.004)).toBe('<0.01 µGy');
    expect(formatDose(null)).toBe('—');
    expect(formatSamples(0)).toBe('0 samples');
    expect(formatSamples(1)).toBe('1 sample');
    expect(formatSamples(null)).toBe('—');
  });

  it('describes a route change with its reason, kind and before/after distance', () => {
    expect(routeKindLabel('slope')).toBe('Slope detour');
    expect(routeKindLabel('other')).toBe('Route updated');
    expect(routeDistanceChange({ before: { distanceM: 412 }, after: { distanceM: 388 } })).toBe('412 m → 388 m');
    expect(routeDistanceChange({ before: null, after: { distanceM: 388 } })).toBe('— → 388 m');
    expect(routeDistanceChange({ before: { distanceM: 412 }, after: null })).toBe('412 m → —');
    expect(routeDistanceChange({ before: null, after: null })).toBeNull();
  });

  it('signs the route review costs and names stops by their map code (#274)', () => {
    expect(formatSignedDelta(40)).toBe('+40 s');
    expect(formatSignedDelta(420)).toBe('+7 min');
    expect(formatSignedDelta(-130)).toBe('-2 min');
    expect(formatSignedDelta(0.2)).toBe('0 s');
    expect(formatSignedDelta(null)).toBe('—');
    expect(formatSignedGrams(41.4)).toBe('+41 g');
    expect(formatSignedGrams(-5.2)).toBe('-5 g');
    expect(formatSignedGrams(0.3)).toBe('0 g');
    expect(formatSignedMetres(120.2)).toBe('+120 m');
    expect(formatMinutes(720)).toBe('12 min');
    expect(formatMinutes(-180)).toBe('-3 min');
    expect(formatMinutes(-10)).toBe('0 min');
    expect(formatMinutes(null)).toBe('—');
    expect(waypointCode('WP2 · dune field edge', 2)).toBe('WP2');
    expect(waypointCode('Cheyava Falls', 4)).toBe('Cheyava Falls');
    expect(waypointCode('HAB', 0)).toBe('HAB');
  });
});

describe('buildMissionLog', () => {
  it('merges event starts/ends and route changes into mission-time order', () => {
    const summary = {
      events: [
        { type: 'start', eventId: 'radiation', label: 'Radiation alert', atSec: 900 },
        { type: 'end', eventId: 'radiation', label: 'Radiation alert', atSec: 1500 },
      ],
      routeChanges: [
        { atSec: 700, kind: 'initial', reason: 'Planned route' },
        { atSec: 1200, kind: 'slope', reason: 'Detour' },
      ],
    };
    const log = buildMissionLog(summary);
    expect(log.map((entry) => entry.atSec)).toEqual([700, 900, 1200, 1500]);
    expect(log.map((entry) => entry.type)).toEqual(['route', 'event', 'route', 'event']);
  });

  it('keeps the summary order for a tie and puts unknown times last', () => {
    const log = buildMissionLog({
      events: [{ type: 'start', eventId: 'a', atSec: 10 }],
      routeChanges: [{ atSec: 10, kind: 'replan' }, { atSec: null, kind: 'replan' }],
    });
    expect(log.map((entry) => entry.type)).toEqual(['event', 'route', 'route']);
    expect(log[2].atSec).toBeNull();
  });

  it('accepts an empty or missing summary without inventing entries', () => {
    expect(buildMissionLog(null)).toEqual([]);
    expect(buildMissionLog({})).toEqual([]);
  });
});
