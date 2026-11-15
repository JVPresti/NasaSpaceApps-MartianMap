import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from './engineBridge.js';
import { resetStore, useMissionStore } from './store.js';

function fakeEngine() {
  return {
    setMode: vi.fn(), setSlopeGrid: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setSkyBlend: vi.fn(),
    setRoute: vi.fn(), setShelter: vi.fn(), setDust: vi.fn(), clearPrints: vi.fn(), setLookSettings: vi.fn(),
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

describe('engine bridge boot prints', () => {
  it('clears the prints when a new EVA starts, not on other changes', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    expect(engine.clearPrints).not.toHaveBeenCalled();
    useMissionStore.setState((s) => ({ view: { ...s.view, layer: 2 } }));
    expect(engine.clearPrints).not.toHaveBeenCalled();
    useMissionStore.setState((s) => ({ mission: { ...s.mission, startedAtMs: 1000 } }));
    expect(engine.clearPrints).toHaveBeenCalledTimes(1);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, elapsedSec: 60 } }));
    expect(engine.clearPrints).toHaveBeenCalledTimes(1);
    disconnect();
  });
});

describe('engine bridge look settings', () => {
  it('pushes the store look settings once when it connects', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    expect(engine.setLookSettings).toHaveBeenCalledTimes(1);
    expect(engine.setLookSettings).toHaveBeenCalledWith(useMissionStore.getState().settings.look);
    disconnect();
  });

  it('pushes a new look object again, and nothing for an unrelated update', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    const next = { sensitivity: 1.6, invertY: true };
    useMissionStore.setState((s) => ({ settings: { ...s.settings, look: next } }));
    expect(engine.setLookSettings).toHaveBeenCalledTimes(2);
    expect(engine.setLookSettings).toHaveBeenLastCalledWith(next);
    useMissionStore.setState((s) => ({ view: { ...s.view, layer: 3 } }));
    expect(engine.setLookSettings).toHaveBeenCalledTimes(2);
    disconnect();
  });
});
