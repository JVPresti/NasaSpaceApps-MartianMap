import { afterEach, describe, expect, it } from 'vitest';
import { isCloseKey } from '../../stops/closeKeys.js';
import { setWristKeyOwner, wristOwnsKeys } from './ownership.js';

afterEach(() => setWristKeyOwner(false));

describe('wrist keyboard ownership (#231)', () => {
  it('is down by default and follows the controller state', () => {
    expect(wristOwnsKeys()).toBe(false);
    setWristKeyOwner(true);
    expect(wristOwnsKeys()).toBe(true);
    setWristKeyOwner(false);
    expect(wristOwnsKeys()).toBe(false);
  });

  it('tells a science stop card to leave Enter and Esc to the wrist while it is up', () => {
    const enter = { code: 'Enter' };
    expect(isCloseKey(enter)).toBe(true);
    setWristKeyOwner(true);
    expect(isCloseKey(enter, { blocked: wristOwnsKeys() })).toBe(false);
    expect(isCloseKey({ code: 'Escape' }, { blocked: wristOwnsKeys() })).toBe(false);
    setWristKeyOwner(false);
    expect(isCloseKey(enter, { blocked: wristOwnsKeys() })).toBe(true);
  });
});
