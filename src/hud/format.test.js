import { describe, expect, it } from 'vitest';
import { batteryLevel, bearingDeg, cardinal, formatEva, formatMinutes, formatValue, nextWaypointInfo, pickAlert, shortName, wrapDeg } from './format.js';
import { NAV_FIX_LIMIT_M, formatFixAge, formatNavError, formatNavLine, navFixPrompt, needsFix } from './format.js';

describe('formatting', () => {
  it('formats the EVA time as h:mm and shows dashes when unknown', () => {
    expect(formatEva(103 * 60)).toBe('1:43');
    expect(formatEva(59)).toBe('0:00');
    expect(formatEva(null)).toBe('–:––');
  });
  it('shows a dash for unknown values, never 0', () => {
    expect(formatValue(null)).toBe('–');
    expect(formatValue(0.624, 2)).toBe('0.62');
    expect(formatMinutes(41 * 60, { signed: true })).toBe('+41');
    expect(formatMinutes(-3 * 60, { signed: true })).toBe('-3');
    expect(formatMinutes(undefined)).toBe('–');
  });
});

describe('compass', () => {
  it('wraps angles and names the nearest compass point', () => {
    expect(wrapDeg(-42)).toBe(318);
    expect(cardinal(318)).toBe('NW');
    expect(cardinal(359)).toBe('N');
    expect(cardinal(91)).toBe('E');
  });
  it('measures bearings clockwise from north, with north at -z', () => {
    expect(bearingDeg({ x: 0, z: 0 }, { x: 0, z: -10 })).toBeCloseTo(0);
    expect(bearingDeg({ x: 0, z: 0 }, { x: 10, z: 0 })).toBeCloseTo(90);
    expect(bearingDeg({ x: 0, z: 0 }, { x: 0, z: 10 })).toBeCloseTo(180);
    expect(bearingDeg({ x: 0, z: 0 }, { x: -10, z: 0 })).toBeCloseTo(270);
  });
});

describe('next waypoint', () => {
  const route = { waypoints: [{ name: 'HAB', x: 520, z: 600 }, { name: 'WP1 · channel floor', x: 330, z: 300 }], nextIndex: 1 };
  it('gives range, bearing and ETA at 1 m/s', () => {
    const w = nextWaypointInfo(route, { x: 330, z: 400 });
    expect(w.shortName).toBe('WP1');
    expect(w.rangeM).toBeCloseTo(100);
    expect(w.bearingDeg).toBeCloseTo(0);
    expect(w.etaSec).toBeCloseTo(100);
  });
  it('is null without a position or a route', () => {
    expect(nextWaypointInfo(route, { x: null, z: null })).toBeNull();
    expect(nextWaypointInfo({ waypoints: [], nextIndex: 0 }, { x: 0, z: 0 })).toBeNull();
  });
  it('keeps names without a code', () => {
    expect(shortName('Cheyava Falls')).toBe('Cheyava Falls');
  });
});

describe('alert banner', () => {
  it('shows the most severe active alert, newest first on a tie, and maps danger to warning', () => {
    expect(pickAlert({})).toBeNull();
    expect(pickAlert({ a: null, b: { level: 'caution', active: false } })).toBeNull();
    const alerts = {
      dust: { id: 'dust', level: 'caution', text: 'Dust', startedAtSec: 10, active: true },
      sep: { id: 'sep', level: 'danger', text: 'SEP', startedAtSec: 5, active: true },
      info: { id: 'info', level: 'info', text: 'Info', startedAtSec: 20, active: true },
    };
    expect(pickAlert(alerts)).toMatchObject({ id: 'sep', level: 'warning' });
    expect(pickAlert({ a: { level: 'caution', startedAtSec: 1, text: 'old' }, b: { level: 'caution', startedAtSec: 9, text: 'new' } }).text).toBe('new');
  });
  it('rates battery levels', () => {
    expect(batteryLevel(75)).toBe('nominal');
    expect(batteryLevel(20)).toBe('caution');
    expect(batteryLevel(8)).toBe('warning');
    expect(batteryLevel(null)).toBe('nominal');
  });
});

describe('navigation line', () => {
  const nav = { x: 8, z: 70, errorM: 0.4, fixMode: 'terrain fix', lastFixSec: 600 };
  it('shows mode, error and age', () => {
    expect(formatNavLine(nav, 600 + 3 * 60)).toBe('NAV · terrain fix · ±0.4 m · 3 min ago');
    expect(formatNavLine({ ...nav, fixMode: 'dead reckoning', errorM: 12.4 }, 600 + 65 * 60)).toBe('NAV · dead reckoning · ±12 m · 1 h 05 min ago');
  });
  it('says when nothing is known instead of showing zeros', () => {
    expect(formatNavLine({ x: null, z: null, errorM: null, fixMode: null, lastFixSec: null }, 0)).toBe('NAV · no position estimate');
    expect(formatNavLine(null, 0)).toBe('NAV · no position estimate');
    expect(formatNavLine({ ...nav, fixMode: null, lastFixSec: null }, 100)).toBe('NAV · – · ±0.4 m · no fix yet');
  });
  it('rounds the error to a tenth under 10 m and to a metre above', () => {
    expect(formatNavError(0.42)).toBe('±0.4 m');
    expect(formatNavError(9.94)).toBe('±9.9 m');
    expect(formatNavError(9.96)).toBe('±10 m');
    expect(formatNavError(37.6)).toBe('±38 m');
    expect(formatNavError(null)).toBe('±– m');
  });
  it('gives the age of the last fix in mission time', () => {
    expect(formatFixAge(100, 159)).toBe('just now');
    expect(formatFixAge(100, 50)).toBe('just now');   // a clock reset never shows a negative age
    expect(formatFixAge(0, 59 * 60 + 59)).toBe('59 min ago');
    expect(formatFixAge(0, 2 * 3600)).toBe('2 h 00 min ago');
    expect(formatFixAge(null, 100)).toBe('no fix yet');
  });
  it('asks for a terrain fix only once the error passes the limit', () => {
    expect(NAV_FIX_LIMIT_M).toBe(5);
    expect(needsFix(NAV_FIX_LIMIT_M)).toBe(false);
    expect(needsFix(NAV_FIX_LIMIT_M + 0.1)).toBe(true);
    expect(needsFix(null)).toBe(false);
    expect(navFixPrompt(0.4)).toBeNull();
    expect(navFixPrompt(6)).toMatch(/terrain fix/);
    expect(navFixPrompt(3, 2)).not.toBeNull();
  });
  it('never mentions satellite navigation', () => {
    const shown = [formatNavLine(nav, 900), formatNavLine(null, 0), navFixPrompt(50)].join(' ');
    expect(shown).not.toMatch(/GPS/i);
  });
});
