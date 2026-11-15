import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createInitialState } from './store.js';
import { connectSlopeGridKey, toggleSlopeGrid } from './slopeGrid.js';

// a keydown with the fields the listener reads; `on` is where it is dispatched, `from` the element it came from
const press = (on, { code, repeat = false, from = null }) => {
  const e = Object.assign(new Event('keydown'), { code, repeat, ctrlKey: false, metaKey: false, altKey: false });
  if (from) Object.defineProperty(e, 'target', { value: from });
  on.dispatchEvent(e);
};

describe('slope grid switch', () => {
  it('starts off and toggles', () => {
    const store = create(() => createInitialState());
    expect(store.getState().view.slopeGrid).toBe(false);
    toggleSlopeGrid(store);
    expect(store.getState().view.slopeGrid).toBe(true);
    toggleSlopeGrid(store);
    expect(store.getState().view.slopeGrid).toBe(false);
  });
  it('does nothing inside the habitat before the EVA', () => {
    const store = create(() => createInitialState()), target = new EventTarget();
    const off = connectSlopeGridKey(store, target);
    press(target, { code: 'KeyG' });
    expect(store.getState().view.slopeGrid).toBe(false);
    off();
  });
  it('toggles on G, ignores held keys, other keys and text fields', () => {
    const store = create(() => ({ ...createInitialState(), stage: 'eva' })), target = new EventTarget();
    const off = connectSlopeGridKey(store, target);
    press(target, { code: 'KeyG' });
    expect(store.getState().view.slopeGrid).toBe(true);
    press(target, { code: 'KeyG', repeat: true });
    press(target, { code: 'KeyH' });
    press(target, { code: 'KeyG', from: { tagName: 'INPUT' } });
    expect(store.getState().view.slopeGrid).toBe(true);
    off();
    press(target, { code: 'KeyG' });
    expect(store.getState().view.slopeGrid).toBe(true);
  });
});
