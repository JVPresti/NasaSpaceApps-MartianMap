import { afterEach, describe, expect, it } from 'vitest';
import { resetStore, useMissionStore } from '../state/store.js';
import { cancelPick, startPick, usePickState } from './useTaskPlace.js';

// The pick of a task place on the table map lasts only while the table is the "Collect samples" table (#352).

const tasks = [{ id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } }];
const samples = () => useMissionStore.setState((s) => ({ needs: { ...s.needs, objective: 'samples', tasks, locked: false } }));

afterEach(() => { cancelPick(); resetStore(); });

describe('a pending task pick', () => {
  it('stays on while the goal is Collect samples and something else changes', () => {
    samples();
    startPick('t1');
    useMissionStore.setState((s) => ({ needs: { ...s.needs, timeMin: 90 } }));
    expect(usePickState.getState().taskId).toBe('t1');
  });

  it('ends when the goal changes, so it never swallows an Escape or comes back with the goal', () => {
    samples();
    startPick('t1');
    useMissionStore.setState((s) => ({ needs: { ...s.needs, objective: 'sortie' } }));
    expect(usePickState.getState()).toEqual({ taskId: null, note: null });
    samples();
    expect(usePickState.getState().taskId).toBeNull();
  });

  it('ends when the needs lock at Begin EVA', () => {
    samples();
    startPick('t1');
    useMissionStore.setState((s) => ({ needs: { ...s.needs, locked: true } }));
    expect(usePickState.getState().taskId).toBeNull();
  });
});
