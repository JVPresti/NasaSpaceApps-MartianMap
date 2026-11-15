import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from './engineBridge.js';
import { resetStore, useMissionStore } from './store.js';

function fakeEngine() {
  return {
    setMode: vi.fn(), setSlopeGrid: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setSkyBlend: vi.fn(), setSkyTime: vi.fn(),
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

describe('engine bridge mission sky (#73)', () => {
  it('sends the local solar time as the clock runs, and nothing when it has not changed', () => {
    const engine = fakeEngine();
    const disconnect = connectEngine(engine);
    expect(engine.setSkyTime).toHaveBeenLastCalledWith(null);   // no mission time yet: the view.sky preset stays
    useMissionStore.setState((s) => ({ mission: { ...s.mission, initialLmst: '17:45', elapsedSec: 0 } }));
    expect(engine.setSkyTime).toHaveBeenLastCalledWith(17.75);
    const calls = engine.setSkyTime.mock.calls.length;
    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(engine.setSkyTime.mock.calls.length).toBe(calls);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, elapsedSec: 60 } }));
    expect(engine.setSkyTime.mock.calls.at(-1)[0]).toBeGreaterThan(17.75);
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

describe('engine bridge habitat prompts', () => {
  it('writes the table prompt state inside the habitat and clears it on the surface', () => {
    vi.useFakeTimers();
    const engine = { ...fakeEngine(), slopeAt: () => 0, habitat: { inside: true, zone: 'main' } };
    engine.getHabitat = () => engine.habitat;
    const disconnect = connectEngine(engine);
    vi.advanceTimersByTime(200);
    expect(useMissionStore.getState().habitat).toEqual({ zone: 'main' });

    const before = useMissionStore.getState().habitat;
    vi.advanceTimersByTime(400);
    expect(useMissionStore.getState().habitat).toBe(before);   // no change, no write

    useMissionStore.setState({ stage: 'eva' });
    vi.advanceTimersByTime(200);
    expect(useMissionStore.getState().habitat).toEqual({ zone: null });
    disconnect();
    vi.useRealTimers();
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

describe('engine bridge airlock move', () => {
  it('writes the moved player position on a stage change, before a later subscriber reads it', () => {
    const engine = { ...fakeEngine(), slopeAt: () => 0, player: { x: 0, z: 0, headingDeg: 0 } };
    engine.getPlayer = () => engine.player;
    const disconnect = connectEngine(engine);
    const seen = [];
    const unsubscribe = useMissionStore.subscribe((s, prev) => {
      if (s.stage !== prev.stage) seen.push([useMissionStore.getState().navigation.trueX, useMissionStore.getState().navigation.trueZ]);
    });
    engine.player = { x: 534.65, z: 573.51, headingDeg: 323 };   // exitAirlock() moved the player; no poll ran since
    useMissionStore.setState({ stage: 'egress' });
    expect(seen).toEqual([[534.65, 573.51]]);
    unsubscribe();
    disconnect();
  });
});
