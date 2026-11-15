import { describe, expect, it, vi } from 'vitest';
import {
  clampLookSettings,
  LOOK_DEFAULTS,
  LOOK_SENSITIVITY_MAX,
  LOOK_SENSITIVITY_MIN,
  LOOK_SENSITIVITY_STEP,
  LOOK_STORAGE_KEY,
  readLookSettings,
  writeLookSettings,
} from './lookSettings.js';

const storageWith = (raw) => ({ getItem: () => raw });

describe('look setting constants', () => {
  it('exposes the storage key, the sensitivity range and the frozen defaults', () => {
    expect(LOOK_STORAGE_KEY).toBe('marswalk.look');
    expect(LOOK_SENSITIVITY_MIN).toBe(0.5);
    expect(LOOK_SENSITIVITY_MAX).toBe(2);
    expect(LOOK_SENSITIVITY_STEP).toBe(0.1);
    expect(LOOK_DEFAULTS).toEqual({ sensitivity: 1, invertY: false });
    expect(Object.isFrozen(LOOK_DEFAULTS)).toBe(true);
  });
});

describe('clampLookSettings', () => {
  it('falls back to the defaults for anything that is not a settings object', () => {
    for (const value of [undefined, null, 5, '1.5', [1, 2], true, () => {}]) {
      expect(clampLookSettings(value), String(value)).toEqual(LOOK_DEFAULTS);
    }
  });

  it('uses the default sensitivity for values that are not finite numbers', () => {
    for (const sensitivity of ['1.5', null, {}, true, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampLookSettings({ sensitivity }).sensitivity, String(sensitivity)).toBe(LOOK_DEFAULTS.sensitivity);
    }
  });

  it('only inverts the view for the boolean true', () => {
    expect(clampLookSettings({ invertY: true }).invertY).toBe(true);
    for (const invertY of [1, 0, 'yes', 'true', {}, [], null, undefined]) {
      expect(clampLookSettings({ invertY }).invertY, String(invertY)).toBe(false);
    }
  });

  it('clamps sensitivity to the supported range and rounds it to one decimal', () => {
    expect(clampLookSettings({ sensitivity: 0.1 }).sensitivity).toBe(LOOK_SENSITIVITY_MIN);
    expect(clampLookSettings({ sensitivity: 0 }).sensitivity).toBe(LOOK_SENSITIVITY_MIN);
    expect(clampLookSettings({ sensitivity: -3 }).sensitivity).toBe(LOOK_SENSITIVITY_MIN);
    expect(clampLookSettings({ sensitivity: 0.44 }).sensitivity).toBe(LOOK_SENSITIVITY_MIN);
    expect(clampLookSettings({ sensitivity: 0.52 }).sensitivity).toBe(0.5);
    expect(clampLookSettings({ sensitivity: 1.44 }).sensitivity).toBe(1.4);
    expect(clampLookSettings({ sensitivity: 1.46 }).sensitivity).toBe(1.5);
    expect(clampLookSettings({ sensitivity: 1.94 }).sensitivity).toBe(1.9);
    expect(clampLookSettings({ sensitivity: 2.04 }).sensitivity).toBe(LOOK_SENSITIVITY_MAX);
    expect(clampLookSettings({ sensitivity: 9 }).sensitivity).toBe(LOOK_SENSITIVITY_MAX);
  });

  it('returns a fresh object and never mutates or returns the frozen defaults', () => {
    const input = { sensitivity: 1.5, invertY: true, extra: 'ignored' };
    const result = clampLookSettings(input);
    expect(result).not.toBe(input);
    expect(result).not.toBe(LOOK_DEFAULTS);
    expect(result).toEqual({ sensitivity: 1.5, invertY: true });
    expect(input).toEqual({ sensitivity: 1.5, invertY: true, extra: 'ignored' });

    const first = clampLookSettings(undefined);
    const second = clampLookSettings(undefined);
    expect(first).not.toBe(second);
    expect(first).not.toBe(LOOK_DEFAULTS);
    expect(first).toEqual(LOOK_DEFAULTS);
  });
});

describe('readLookSettings', () => {
  it('reads the stored preference under the look key', () => {
    const getItem = vi.fn(() => JSON.stringify({ sensitivity: 1.7, invertY: true }));
    expect(readLookSettings({ getItem })).toEqual({ sensitivity: 1.7, invertY: true });
    expect(getItem).toHaveBeenCalledWith(LOOK_STORAGE_KEY);
  });

  it('clamps a stored value that is out of range or wrongly typed', () => {
    expect(readLookSettings(storageWith('{"sensitivity":9,"invertY":"yes"}'))).toEqual({ sensitivity: 2, invertY: false });
    expect(readLookSettings(storageWith('{"sensitivity":0.05,"invertY":true}'))).toEqual({ sensitivity: 0.5, invertY: true });
  });

  it('falls back to the defaults when the key is absent or the JSON is invalid', () => {
    expect(readLookSettings(storageWith(null))).toEqual(LOOK_DEFAULTS);
    expect(readLookSettings(storageWith('{'))).toEqual(LOOK_DEFAULTS);
    expect(readLookSettings(storageWith(''))).toEqual(LOOK_DEFAULTS);
  });

  it('rejects JSON values that are not plain objects', () => {
    for (const raw of ['5', 'null', '[1,2]', 'true', '"2"']) {
      expect(readLookSettings(storageWith(raw)), raw).toEqual(LOOK_DEFAULTS);
    }
  });

  it('survives missing storage, missing getItem and blocked storage', () => {
    expect(readLookSettings(undefined)).toEqual(LOOK_DEFAULTS);
    expect(readLookSettings(null)).toEqual(LOOK_DEFAULTS);
    expect(readLookSettings({})).toEqual(LOOK_DEFAULTS);
    expect(readLookSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(LOOK_DEFAULTS);
  });
});

describe('writeLookSettings', () => {
  it('stores the clamped preference as JSON and reports success', () => {
    const setItem = vi.fn();
    expect(writeLookSettings({ sensitivity: 9, invertY: true }, { setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":2,"invertY":true}');
  });

  it('stores the defaults when given garbage', () => {
    const setItem = vi.fn();
    expect(writeLookSettings({ sensitivity: 'fast', invertY: 'yes' }, { setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":1,"invertY":false}');
    expect(writeLookSettings(undefined, { setItem })).toBe(true);
    expect(setItem).toHaveBeenLastCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":1,"invertY":false}');
  });

  it('round-trips a preference through the same storage', () => {
    const saved = new Map();
    const storage = {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => { saved.set(key, value); },
    };
    expect(writeLookSettings({ sensitivity: 0.5, invertY: true }, storage)).toBe(true);
    expect(readLookSettings(storage)).toEqual({ sensitivity: 0.5, invertY: true });
  });

  it('returns false without throwing when storage is unavailable or refuses the write', () => {
    expect(writeLookSettings(LOOK_DEFAULTS, undefined)).toBe(false);
    expect(writeLookSettings(LOOK_DEFAULTS, null)).toBe(false);
    expect(writeLookSettings(LOOK_DEFAULTS, {})).toBe(false);
    expect(writeLookSettings(LOOK_DEFAULTS, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
});
