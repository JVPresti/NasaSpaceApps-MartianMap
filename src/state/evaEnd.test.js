import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canEndEva, connectEvaEnd, END_EVA_KEY } from './evaEnd.js';
import { resetStore, useMissionStore } from './store.js';

function keyTarget() {
  const handlers = new Set();
  return {
    addEventListener: (type, fn) => handlers.add(fn),
    removeEventListener: (type, fn) => handlers.delete(fn),
    press: (code, extra = {}) => { const e = { code, preventDefault: vi.fn(), target: null, ...extra }; for (const fn of handlers) fn(e); return e; },
    handlers,
  };
}

const atHabitat = (patch = {}) => useMissionStore.setState((s) => ({
  mode: 'walk', mission: { ...s.mission, paused: false }, eva: { ...s.eva, phase: 'active', atHabitat: true, ...patch },
}));

beforeEach(() => resetStore());

describe('ending the EVA at the habitat (#244)', () => {
  it('applies only during the EVA, back at the habitat, walking with the mission running', () => {
    expect(canEndEva(useMissionStore.getState())).toBe(false);
    atHabitat();
    expect(canEndEva(useMissionStore.getState())).toBe(true);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(canEndEva(useMissionStore.getState())).toBe(false);
  });

  it('shows the prompt over the table and asks to end the EVA on the key', () => {
    const engine = { setHabitatPrompt: vi.fn() }, target = keyTarget();
    const off = connectEvaEnd(engine, useMissionStore, target);
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);
    target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(false);   // not at the habitat yet

    atHabitat();
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith({ key: END_EVA_KEY, text: expect.any(String) });
    target.press('KeyX', { repeat: true });
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
    const e = target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();

    useMissionStore.setState((s) => ({ eva: { ...s.eva, atHabitat: false } }));
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);
    off();
    expect(target.handlers.size).toBe(0);
  });
});
