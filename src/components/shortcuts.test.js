import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from '../state/engineBridge.js';
import { resetStore, setLayer, setMode, useMissionStore } from '../state/store.js';
import { handleShortcut } from './shortcuts.js';

function press(code, extra = {}) {
  const event = { code, preventDefault: vi.fn(), ...extra };
  handleShortcut(event);
  return event;
}

beforeEach(resetStore);
afterEach(resetStore);

describe('mission keyboard shortcuts', () => {
  it('toggles modes in both directions using physical codes, regardless of key label', () => {
    expect(press('KeyM', { key: 'different-layout' }).preventDefault).toHaveBeenCalledOnce();
    expect(useMissionStore.getState().mode).toBe('plan');
    press('KeyM');
    expect(useMissionStore.getState().mode).toBe('walk');
    setMode('plan');
    press('KeyM');
    expect(useMissionStore.getState().mode).toBe('walk');
  });

  it('cycles all five layers forwards and backwards with wraparound in either mode', () => {
    for (const mode of ['plan', 'walk']) {
      setMode(mode);
      setLayer(0);
      for (const expected of [1, 2, 3, 4, 0]) {
        press('KeyL');
        expect(useMissionStore.getState().view.layer).toBe(expected);
      }
      for (const expected of [4, 3, 2, 1, 0]) {
        press('KeyL', { shiftKey: true });
        expect(useMissionStore.getState().view.layer).toBe(expected);
      }
    }
  });

  it.each(['Digit0', 'Numpad0'])('%s switches the current layer off', (code) => {
    setLayer(3);
    press(code);
    expect(useMissionStore.getState().view.layer).toBe(0);
  });

  it.each([
    { repeat: true }, { isComposing: true }, { defaultPrevented: true },
    { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { target: { isContentEditable: true } },
    ...['input', 'textarea', 'select', '[role="textbox"]', 'dialog[open]', '[aria-modal="true"]'].map((selector) => ({
      target: { closest: (selectors) => selectors.split(', ').includes(selector) },
    })),
    { composedPath: () => [{ isContentEditable: true }] },
  ])('leaves state and native key handling alone for %j', (extra) => {
    setLayer(2);
    const state = useMissionStore.getState();
    for (const code of ['KeyM', 'KeyL', 'Digit0']) {
      expect(press(code, extra).preventDefault).not.toHaveBeenCalled();
      expect(useMissionStore.getState()).toBe(state);
    }
  });

  it('does not consume unrelated keys or repeat a held toggle', () => {
    press('KeyM');
    press('KeyM', { repeat: true });
    expect(useMissionStore.getState().mode).toBe('plan');
    expect(press('KeyW').preventDefault).not.toHaveBeenCalled();
  });

  it('delivers mode and layer changes through the existing engine bridge', () => {
    const engine = {
      setMode: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setRoute: vi.fn(),
      setShelter: vi.fn(), setDust: vi.fn(), setSlopeGrid: vi.fn(),
    };
    const disconnect = connectEngine(engine);
    try {
      press('KeyM');
      expect(engine.setMode).toHaveBeenLastCalledWith('plan');
      press('KeyL');
      expect(engine.setLayer).toHaveBeenLastCalledWith(1);
      press('KeyL', { shiftKey: true });
      expect(engine.setLayer).toHaveBeenLastCalledWith(0);
    } finally {
      disconnect();
    }
  });
});
