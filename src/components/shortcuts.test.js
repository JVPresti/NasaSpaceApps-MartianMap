import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEngine } from '../state/engineBridge.js';
import { resetStore, setLayer, setMode, useMissionStore } from '../state/store.js';
import { setWristKeyOwner } from '../screens/wrist/ownership.js';
import { handleShortcut } from './shortcuts.js';

function press(code, extra = {}, options) {
  const event = { code, preventDefault: vi.fn(), ...extra };
  handleShortcut(event, options);
  return event;
}

beforeEach(resetStore);
afterEach(() => { resetStore(); setWristKeyOwner(false); });

describe('mission keyboard shortcuts', () => {
  it('toggles modes in both directions using physical codes, regardless of key label', () => {
    setMode('walk');   // the store opens in Plan (#166); start from Walk to toggle both ways
    expect(press('KeyM', { key: 'different-layout' }).preventDefault).toHaveBeenCalledOnce();
    expect(useMissionStore.getState().mode).toBe('plan');
    press('KeyM');
    expect(useMissionStore.getState().mode).toBe('walk');
    setMode('plan');
    press('KeyM');
    expect(useMissionStore.getState().mode).toBe('walk');
  });

  it('cycles all seven layers at the table and the four the ground draws in Walk, both ways with wraparound', () => {
    for (const [mode, forward, backward] of [['plan', [1, 2, 3, 4, 5, 6, 0], [6, 5, 4, 3, 2, 1, 0]], ['walk', [1, 2, 3, 0], [3, 2, 1, 0]]]) {
      setMode(mode);
      setLayer(0);
      for (const expected of forward) {
        press('KeyL');
        expect(useMissionStore.getState().view.layer).toBe(expected);
      }
      for (const expected of backward) {
        press('KeyL', { shiftKey: true });
        expect(useMissionStore.getState().view.layer).toBe(expected);
      }
    }
  });

  it('moves on from a table-only layer in Walk to a layer the ground draws', () => {
    setMode('walk');
    setLayer(4);   // radio shadow, chosen at the table
    press('KeyL');
    expect(useMissionStore.getState().view.layer).toBe(1);
    setLayer(5);   // exposure
    press('KeyL', { shiftKey: true });
    expect(useMissionStore.getState().view.layer).toBe(3);
    setLayer(5);
    press('Digit0');
    expect(useMissionStore.getState().view.layer).toBe(0);
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
    setMode('walk');
    press('KeyM');
    press('KeyM', { repeat: true });
    expect(useMissionStore.getState().mode).toBe('plan');
    expect(press('KeyW').preventDefault).not.toHaveBeenCalled();
  });

  it('leaves M, L, Shift+L and 0 to the wrist screen while it is up (#231)', () => {
    setMode('walk');
    setLayer(2);
    setWristKeyOwner(true);
    for (const [code, extra] of [['KeyM'], ['KeyL'], ['KeyL', { shiftKey: true }], ['Digit0']]) {
      expect(press(code, extra).preventDefault).not.toHaveBeenCalled();
    }
    expect(useMissionStore.getState().mode).toBe('walk');
    expect(useMissionStore.getState().view.layer).toBe(2);
    setWristKeyOwner(false);
    press('KeyL');
    expect(useMissionStore.getState().view.layer).toBe(3);
  });

  it('sends M through the mode button handler when one is given, so Walk gets the pointer lock (#174)', () => {
    const onMode = vi.fn();
    setMode('walk');   // the store opens in Plan (#166); start from Walk
    expect(press('KeyM', {}, { onMode }).preventDefault).toHaveBeenCalledOnce();
    expect(onMode).toHaveBeenLastCalledWith('plan');
    expect(useMissionStore.getState().mode).toBe('walk');          // the handler owns the change, not the shortcut
    setMode('plan');
    press('KeyM', {}, { onMode });
    expect(onMode).toHaveBeenLastCalledWith('walk');
    expect(onMode).toHaveBeenCalledTimes(2);
  });

  it('keeps the guards and leaves layer keys alone when a mode handler is given', () => {
    const onMode = vi.fn();
    for (const extra of [{ repeat: true }, { ctrlKey: true }, { target: { closest: () => true } }]) {
      expect(press('KeyM', extra, { onMode }).preventDefault).not.toHaveBeenCalled();
    }
    press('KeyL', {}, { onMode });
    press('Digit0', {}, { onMode });
    expect(onMode).not.toHaveBeenCalled();
    expect(useMissionStore.getState().view.layer).toBe(0);
  });

  it('delivers mode and layer changes through the existing engine bridge', () => {
    const engine = {
      setMode: vi.fn(), setLayer: vi.fn(), setSky: vi.fn(), setSkyTime: vi.fn(), setRoute: vi.fn(),
      setShelter: vi.fn(), setDust: vi.fn(), setSlopeGrid: vi.fn(), setLookSettings: vi.fn(),
    };
    setMode('walk');
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
