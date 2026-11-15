import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { zoneStatus } from './zoneStatus.js';

afterEach(() => setLanguage('en'));

const zone = (over = {}) => ({
  kind: 'plan', events: [], cols: 3, rows: 1, x0: 0, z0: 0, dx: 4, dz: 4, from: { x: 0, z: 0 }, homeSec: new Float32Array([60, 0, 0]),
  inputs: { o2G: 771, o2UsableG: 771, reserveSec: 1800, evaLimitSec: 1530, elapsedSec: 0, shelterWithinSec: null },
  stats: { limit: 'eva', reachM: 613 },
  budget: { availableSec: 1800, reserveSec: 270 },
  ...over,
});

describe('zoneStatus', () => {
  it('names the plan that bounds the zone before the EVA', () => {
    expect(zoneStatus(zone())).toEqual({
      head: 'Your plan: 30 min, 15 % time reserve · 30 min O2 reserve · 100 % O2',
      limit: 'Your planned time sets the edge',
      reach: 'reach 610 m',
    });
  });

  it('says when the radiation window cannot be met from where the crew stands', () => {
    const rad = { kind: 'live', events: ['radiation'], stats: { limit: 'window', reachM: 0 } };
    const window = (sec, homeSec) => zoneStatus(zone({ ...rad, homeSec: new Float32Array([homeSec, 0, 0]), inputs: { ...zone().inputs, shelterWithinSec: sec } })).limit;
    expect(window(14, 60)).toBe('Radiation alert: shelter 60 s away, window 14 s. Walk home now');
    expect(window(14, Infinity)).toBe('Radiation alert: shelter out of reach in the 14 s window. Walk home now');
    expect(window(14, 8)).toBe('Radiation alert: shelter within 14 s');
    expect(window(0, 8)).toBe('Radiation alert: shelter window closed, walk home');
  });

  it('names the storm re-plan', () => {
    expect(zoneStatus(zone({ kind: 'live', events: ['dust-storm'], stats: { limit: 'event', reachM: 79 } })).limit).toBe('Dust storm: re-planned home, only the way home stays');
  });
});
