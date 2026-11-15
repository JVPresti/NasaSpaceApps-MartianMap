import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SamplingCrosshair } from '../../hud/SamplingPanel.jsx';
import { isCloseKey } from '../../stops/closeKeys.js';
import { setWristKeyOwner, subscribeWristKeyOwner, wristOwnsKeys } from './ownership.js';

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

  it('notifies subscribers once per change, so the HUD can follow the wrist', () => {
    const listener = vi.fn();
    const off = subscribeWristKeyOwner(listener);
    setWristKeyOwner(true);
    setWristKeyOwner(true);
    setWristKeyOwner(false);
    off();
    setWristKeyOwner(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('hides the sampling crosshair while the wrist is up, since sampling ignores its inputs then', () => {
    expect(renderToStaticMarkup(<SamplingCrosshair />)).toContain('hud-reticle');
    setWristKeyOwner(true);
    expect(renderToStaticMarkup(<SamplingCrosshair />)).not.toContain('hud-reticle');
  });
});
