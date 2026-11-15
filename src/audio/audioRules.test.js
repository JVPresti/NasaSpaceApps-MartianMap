import { describe, expect, it } from 'vitest';
import {
  ALERT_TONES, BREATHS_AT_PEAK, BREATHS_AT_REST, DOSIMETER_PEAK, MAX_STEP_JUMP_M, STRIDE_M,
  breathDepth, breathRate, dosimeterRate, fanLevel, newAlerts, radioCue, shelterOf, stepsFor, suitAudible, windLevel,
} from './audioRules.js';

describe('breathing (#72)', () => {
  it('rises with effort, so a climb is heard', () => {
    expect(breathRate(0)).toBe(BREATHS_AT_REST);
    expect(breathRate(1)).toBe(BREATHS_AT_PEAK);
    expect(breathRate(0.6)).toBeGreaterThan(breathRate(0.3));
    expect(breathDepth(0.8)).toBeGreaterThan(breathDepth(0.2));
    expect(fanLevel(1)).toBeGreaterThan(fanLevel(0));
  });
  it('treats a missing effort as rest and clamps', () => {
    expect(breathRate(null)).toBe(BREATHS_AT_REST);
    expect(breathRate(3)).toBe(BREATHS_AT_PEAK);
  });
});

describe('alert tones (#72)', () => {
  it('has a distinct tone for every alert level', () => {
    const shapes = Object.values(ALERT_TONES).map((t) => JSON.stringify([t.wave, t.notes, t.sweep]));
    expect(new Set(shapes).size).toBe(Object.keys(ALERT_TONES).length);
    expect(Object.keys(ALERT_TONES).sort()).toEqual(['caution', 'danger', 'info', 'warning']);
  });
  it('plays an alert once when it starts and again only when it gets worse', () => {
    const caution = { 'low-o2': { level: 'caution', active: true } };
    expect(newAlerts({}, caution)).toEqual([{ id: 'low-o2', level: 'caution' }]);
    expect(newAlerts(caution, { 'low-o2': { level: 'caution', active: true } })).toEqual([]);
    expect(newAlerts(caution, { 'low-o2': { level: 'warning', active: true } })).toEqual([{ id: 'low-o2', level: 'warning' }]);
    expect(newAlerts(caution, { 'low-o2': { level: 'info', active: true } })).toEqual([]);
    expect(newAlerts({}, { a: { level: 'caution', active: false }, b: null })).toEqual([]);
  });
  it('puts the most severe new alert first', () => {
    const next = { a: { level: 'caution' }, b: { level: 'danger' }, c: { level: 'warning' } };
    expect(newAlerts({}, next).map((a) => a.level)).toEqual(['danger', 'warning', 'caution']);
  });
});

describe('radio cues (#72)', () => {
  it('follows the partner link', () => {
    expect(radioCue([{ link: true }], [{ link: false }])).toBe('lost');
    expect(radioCue([{ link: false }], [{ link: true }])).toBe('back');
    expect(radioCue([{ link: true }], [{ link: true }])).toBeNull();
    expect(radioCue([], [{ link: true }])).toBeNull();
    expect(radioCue([{}], [{ link: true }])).toBeNull();
  });
});

describe('footsteps and when the suit is heard (#72)', () => {
  it('counts a step per stride and carries the rest', () => {
    expect(stepsFor(0, STRIDE_M * 0.5)).toEqual({ steps: 0, carried: STRIDE_M * 0.5 });
    const r = stepsFor(STRIDE_M * 0.6, STRIDE_M * 0.6);
    expect(r.steps).toBe(1);
    expect(r.carried).toBeCloseTo(STRIDE_M * 0.2, 9);
  });
  it('ignores standing still and teleports', () => {
    expect(stepsFor(0.3, 0)).toEqual({ steps: 0, carried: 0.3 });
    expect(stepsFor(0.3, MAX_STEP_JUMP_M + 1)).toEqual({ steps: 0, carried: 0 });
  });
  it('plays the suit only in Walk while the mission runs', () => {
    expect(suitAudible({ mode: 'walk', mission: { paused: false } })).toBe(true);
    expect(suitAudible({ mode: 'plan', mission: { paused: false } })).toBe(false);
    expect(suitAudible({ mode: 'walk', mission: { paused: true } })).toBe(false);
  });
});

describe('event sounds (#72)', () => {
  it('ticks the dosimeter faster as the solar particle event builds, silent at the background', () => {
    expect(dosimeterRate(10)).toBe(0);              // Gale background (RAD)
    expect(dosimeterRate(null)).toBe(0);
    expect(dosimeterRate(20)).toBeGreaterThan(0);
    expect(dosimeterRate(29.92)).toBeGreaterThan(dosimeterRate(20) * 3);
    expect(dosimeterRate(100)).toBe(DOSIMETER_PEAK);
  });
  it('raises the wind with the wind speed and the storm, never past 1', () => {
    expect(windLevel(2, 0)).toBe(0);
    expect(windLevel(12, 0)).toBeGreaterThan(windLevel(6, 0));
    expect(windLevel(6, 1)).toBeGreaterThan(windLevel(6, 0));
    expect(windLevel(40, 1)).toBe(1);
    expect(windLevel(null, 0)).toBe(0);
  });
  it('shelters the player from the outside inside the habitat', () => {
    expect(shelterOf('main')).toBe(1);
    expect(shelterOf('inner')).toBe(1);
    expect(shelterOf('airlock')).toBeGreaterThan(shelterOf('hatch'));
    expect(shelterOf('porch')).toBe(0);
    expect(shelterOf(null)).toBe(0);
  });
});
