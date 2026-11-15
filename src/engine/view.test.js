import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyLook, JOG_SPEED, LOOK_PITCH_LIMIT, WALK_SPEED } from './view.js';

const hazards = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'),
);

describe('walking speed', () => {
  it('matches mobility.speed.flat and mobility.speed.jog in hazards.json', () => {
    expect(WALK_SPEED).toBe(hazards.values['mobility.speed.flat'].value);
    expect(JOG_SPEED).toBe(hazards.values['mobility.speed.jog'].value);
  });

  it('stays inside the speeds the walking O2 model was fitted to', () => {
    const [, fastestTested] = hazards.values['mobility.speed.mars_suited_tested'].value;
    expect(JOG_SPEED).toBeLessThanOrEqual(fastestTested);
  });
});

describe('applyLook (mouse look, #102)', () => {
  const K = 0.0025;
  const view = () => ({ yaw: 0, pitch: 0 });

  it('keeps the old rates with the default settings', () => {
    const v = view();
    applyLook(v, 100, 40, K);
    expect(v.yaw).toBeCloseTo(100 * K, 12);
    expect(v.pitch).toBeCloseTo(40 * K, 12);
  });

  it('multiplies both axes by the sensitivity', () => {
    for (const sensitivity of [2, 0.5]) {
      const v = view();
      applyLook(v, 100, 40, K, { sensitivity });
      expect(v.yaw, String(sensitivity)).toBeCloseTo(100 * K * sensitivity, 12);
      expect(v.pitch, String(sensitivity)).toBeCloseTo(40 * K * sensitivity, 12);
    }
  });

  it('inverts only the pitch when invertY is on, and leaves yaw alone', () => {
    const normal = view(), inverted = view();
    applyLook(normal, 100, 40, K, { sensitivity: 1, invertY: false });
    applyLook(inverted, 100, 40, K, { sensitivity: 1, invertY: true });
    expect(inverted.yaw).toBe(normal.yaw);
    expect(inverted.pitch).toBe(-normal.pitch);
    expect(inverted.pitch).toBeLessThan(0);   // moving down now looks up
  });

  it('clamps the pitch at the look limit for a huge delta', () => {
    for (const dy of [100000, -100000]) {
      const v = view();
      applyLook(v, 0, dy, K, { sensitivity: 2, invertY: dy < 0 });
      expect(Math.abs(v.pitch)).toBe(LOOK_PITCH_LIMIT);
    }
    expect(LOOK_PITCH_LIMIT).toBe(1.2);
  });

  it('falls back to the default sensitivity when it is missing or not finite', () => {
    for (const settings of [undefined, {}, { sensitivity: Number.NaN }, { sensitivity: Number.POSITIVE_INFINITY }, { sensitivity: '2' }]) {
      const v = view();
      applyLook(v, 100, 40, K, settings);
      expect(v.yaw, String(settings?.sensitivity)).toBeCloseTo(100 * K, 12);
      expect(v.pitch, String(settings?.sensitivity)).toBeCloseTo(40 * K, 12);
    }
  });
});
