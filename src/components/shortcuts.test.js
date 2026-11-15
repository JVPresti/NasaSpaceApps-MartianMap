import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from '../state/engineBridge.js';
import { resetStore, setLayer, setMode, useMissionStore } from '../state/store.js';
import { setWristKeyOwner } from '../screens/wrist/ownership.js';
import { handleShortcut } from './shortcuts.js';

function press(code, extra = {}) {
  const event = { code, preventDefault: vi.fn(), ...extra };
  handleShortcut(event);
  return event;
}

beforeEach(resetStore);
afterEach(() => { resetStore(); setWristKeyOwner(false); });

describe('mission keyboard shortcuts', () => {
  it('has no Plan / Walk key: M changes nothing (habitat-first flow)', () => {
    for (const mode of ['walk', 'plan']) {
      setMode(mode);
      const state = useMissionStore.getState();
      expect(press('KeyM').preventDefault).not.toHaveBeenCalled();
      expect(useMissionStore.getState()).toBe(state);
    }
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

  it('does not consume unrelated keys', () => {
    expect(press('KeyW').preventDefault).not.toHaveBeenCalled();
    expect(press('KeyE').preventDefault).not.toHaveBeenCalled();   // E belongs to the mission table and sampling
  });

  it('leaves L, Shift+L and 0 to the wrist screen while it is up (#231)', () => {
    setMode('walk');
    setLayer(2);
    setWristKeyOwner(true);
    for (const [code, extra] of [['KeyL'], ['KeyL', { shiftKey: true }], ['Digit0']]) {
      expect(press(code, extra).preventDefault).not.toHaveBeenCalled();
    }
    expect(useMissionStore.getState().mode).toBe('walk');
    expect(useMissionStore.getState().view.layer).toBe(2);
    setWristKeyOwner(false);
    press('KeyL');
    expect(useMissionStore.getState().view.layer).toBe(3);
  });

  it('delivers layer changes through the existing engine bridge', () => {
    const engine = {
      setMode: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setSkyTime: vi.fn(), setRoute: vi.fn(),
      setShelter: vi.fn(), setDust: vi.fn(), setSlopeGrid: vi.fn(), setLookSettings: vi.fn(),
    };
    setMode('walk');
    const disconnect = connectEngine(engine);
    try {
      press('KeyL');
      expect(engine.setLayer).toHaveBeenLastCalledWith(1);
      press('KeyL', { shiftKey: true });
      expect(engine.setLayer).toHaveBeenLastCalledWith(0);
    } finally {
      disconnect();
    }
  });
});

describe('visor frame shortcut (#28)', () => {
  it('V turns the visor frame off and on in Walk', () => {
    setMode('walk');
    expect(useMissionStore.getState().settings.visorFrame).toBe(true);
    expect(press('KeyV').preventDefault).toHaveBeenCalledOnce();
    expect(useMissionStore.getState().settings.visorFrame).toBe(false);
    press('KeyV');
    expect(useMissionStore.getState().settings.visorFrame).toBe(true);
  });

  it('V does nothing at the mission table, and the choice survives a restart', () => {
    setMode('plan');
    expect(press('KeyV').preventDefault).not.toHaveBeenCalled();
    expect(useMissionStore.getState().settings.visorFrame).toBe(true);
    setMode('walk');
    press('KeyV');
    resetStore();
    expect(useMissionStore.getState().settings.visorFrame).toBe(false);
    press('KeyV');   // settings outlive resetStore, so leave the frame on for later tests
  });
});
