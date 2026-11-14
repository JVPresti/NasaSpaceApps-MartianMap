import { describe, expect, it } from 'vitest';
import { createInputGate } from './input.js';

describe('walk input gate', () => {
  it('accepts keys while open and ignores new ones while closed', () => {
    const gate = createInputGate();
    expect(gate.keyDown('KeyW')).toBe(true);
    expect(gate.isDown('KeyW')).toBe(true);
    expect(gate.keyUp('KeyW')).toBe(true);
    expect(gate.isDown('KeyW')).toBe(false);

    gate.setEnabled(false);
    expect(gate.keyDown('KeyW')).toBe(false);
    expect(gate.isDown('KeyW')).toBe(false);
  });

  it('clears held keys when a menu disables input, and still records their release', () => {
    const gate = createInputGate();
    gate.keyDown('KeyW');
    gate.keyDown('ShiftLeft');
    expect(gate.isDown('KeyW')).toBe(true);

    gate.setEnabled(false);
    expect(gate.isDown('KeyW')).toBe(false);
    expect(gate.isDown('ShiftLeft')).toBe(false);

    // The physical key-up arrives after the menu opened: it must not throw and must not reopen input.
    expect(gate.keyUp('KeyW')).toBe(true);
    expect(gate.isEnabled()).toBe(false);
    expect(gate.isDown('KeyW')).toBe(false);
  });

  it('starts closed when asked, and reopening does not revive an old press', () => {
    const gate = createInputGate({ enabled: false });
    expect(gate.isEnabled()).toBe(false);
    expect(gate.keyDown('KeyA')).toBe(false);
    gate.setEnabled(true);
    expect(gate.isDown('KeyA')).toBe(false);
    expect(gate.keyDown('KeyA')).toBe(true);
  });

  it('ignores empty or non-string key codes', () => {
    const gate = createInputGate();
    expect(gate.keyDown('')).toBe(false);
    expect(gate.keyDown(undefined)).toBe(false);
    expect(gate.keyUp('')).toBe(false);
    expect(gate.isDown('')).toBe(false);
  });
});
