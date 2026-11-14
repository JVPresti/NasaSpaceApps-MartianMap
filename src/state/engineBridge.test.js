import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from './engineBridge.js';
import { resetStore, useMissionStore } from './store.js';

function fakeEngine() {
  return {
    setMode: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setSkyBlend: vi.fn(),
    setRoute: vi.fn(), setShelter: vi.fn(), setDust: vi.fn(),
    getPlayer: () => ({ x: 0, z: 0, headingDeg: 0 }),
  };
}

beforeEach(() => resetStore());

describe('engine bridge sky', () => {
  it('keeps the default preset at start instead of blending from clear_day', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    expect(engine.setSky).toHaveBeenCalledWith('late_afternoon');
    expect(engine.setSkyBlend).not.toHaveBeenCalled();
    disconnect();
  });

  it('blends the dust storm from the current preset and back to it', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    useMissionStore.setState((s) => ({ view: { ...s.view, skyBlend: 0.4 } }));
    expect(engine.setSkyBlend).toHaveBeenLastCalledWith('late_afternoon', 'dust_storm', 0.4);
    useMissionStore.setState((s) => ({ view: { ...s.view, skyBlend: 0 } }));
    expect(engine.setSkyBlend).toHaveBeenLastCalledWith('late_afternoon', 'dust_storm', 0);
    disconnect();
  });
});
