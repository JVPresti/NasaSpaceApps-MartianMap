import { describe, expect, it } from 'vitest';
import { batteryLevel, bearingDeg, cardinal, formatEva, formatMinutes, formatValue, nextWaypointInfo, pickAlert, shortName, wrapDeg } from './format.js';

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
