import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { medaAt, parseMedaSol } from '../data/medaRad.js';
import { MARS_SEC_PER_EARTH_SEC, parseLmst } from '../sim/missionClock.js';
import { dustAgainstLimit, medaOverWindow, plannedWalkSec, spaceWeather, walkStartLmstSec } from './outlook.js';

const meda = parseMedaSol(JSON.parse(readFileSync(new URL('../../public/data/meda_sol.json', import.meta.url), 'utf8')));
const hazards = JSON.parse(readFileSync(new URL('../../public/data/hazards.json', import.meta.url), 'utf8'));

describe('conditions outlook (#248)', () => {
  it('plans the window over the crew\'s budget, else the walk out and back', () => {
    expect(plannedWalkSec({ budget: { usedSec: 840 }, totals: { timeSec: 400, returnTimeSec: 300 } })).toBe(840);
    expect(plannedWalkSec({ budget: null, totals: { timeSec: 400, returnTimeSec: 300 } })).toBe(700);
    expect(plannedWalkSec({ totals: { timeSec: 400, returnTimeSec: 300, roundTrip: true } })).toBe(400);
    expect(plannedWalkSec({})).toBeNull();
  });

  it('starts the window when the mission clock will start, or started', () => {
    expect(walkStartLmstSec(null, 'late_afternoon')).toBe(parseLmst('17:45'));
    expect(walkStartLmstSec({ initialLmst: '14:00' }, 'late_afternoon')).toBe(parseLmst('14:00'));
    expect(walkStartLmstSec({ initialLmst: 'later' }, 'clear_day')).toBe(parseLmst('14:00'));
  });

  it('gives the lowest and highest MEDA value over the window, replayed at the local times the walk covers', () => {
    const start = parseLmst('17:45');
    const window = medaOverWindow(meda, start, 1800);
    expect(window.fromLmst).toBe('17:45');
    expect(window.toLmst).toBe('18:14');   // 30 Earth minutes are 29.2 minutes of Mars local time
    for (const key of ['pressurePa', 'tempC', 'windMs']) {
      const { min, max, source } = window.channels[key];
      expect(min).toBeLessThanOrEqual(max);
      expect(['DATA', 'DERIVED']).toContain(source.tag);
      expect(source.label).toMatch(/MEDA · Perseverance · sol \d+/);
    }
    // the ends of the window are inside the range
    const atEnd = medaAt(meda, start + 1800 * MARS_SEC_PER_EARTH_SEC).values;
    expect(atEnd.tempC).toBeGreaterThanOrEqual(window.channels.tempC.min);
    expect(atEnd.tempC).toBeLessThanOrEqual(window.channels.tempC.max);
    // a pressure in pascals and a cold evening, as Jezero
    expect(window.channels.pressurePa.min).toBeGreaterThan(500);
    expect(window.channels.tempC.max).toBeLessThan(0);
  });

  it('a zero-length window is one sample', () => {
    const window = medaOverWindow(meda, parseLmst('12:00'), 0);
    expect(window.channels.tempC.min).toBe(window.channels.tempC.max);
  });

  it('flags dust above the terrain-fix limit of hazards.json', () => {
    const limit = hazards.values['dust.event.nav_fix_tau_max'].value;
    expect(limit).toBe(1);
    expect(dustAgainstLimit(hazards.values['dust.tau.clear_season'].value, limit)).toEqual({ tau: 0.45, limit: 1, over: false });
    expect(dustAgainstLimit(8, limit).over).toBe(true);
    expect(dustAgainstLimit(null, limit)).toBeNull();
  });

  it('gives the space-weather state with the DONKI lead time', () => {
    const lead = hazards.values['radiation.sep_2017.warning_lead_time'].value;
    expect(lead).toBe(224);
    expect(spaceWeather({ leadMin: lead, atSec: 95 })).toEqual({ state: 'scheduled', leadMin: 224, atSec: 95 });
    expect(spaceWeather({ leadMin: lead, atSec: 95, off: true }).state).toBe('off');
    expect(spaceWeather({ leadMin: lead, atSec: 95, active: true }).state).toBe('active');
    expect(spaceWeather({ leadMin: lead }).state).toBe('watch');
  });
});
