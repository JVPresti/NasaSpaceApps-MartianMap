import { describe, expect, it } from 'vitest';
import { applyVisorClasses, isDetailToggle, samplingInProgress } from './visorMode.js';

const key = (over = {}) => ({ code: 'KeyI', repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'BODY' }, ...over });

describe('I toggles every instrument (#283)', () => {
  it('toggles on a plain I press', () => expect(isDetailToggle(key())).toBe(true));
  it('ignores other keys, repeats and modifiers', () => {
    expect(isDetailToggle(key({ code: 'KeyO' }))).toBe(false);
    expect(isDetailToggle(key({ repeat: true }))).toBe(false);
    for (const m of ['ctrlKey', 'metaKey', 'altKey']) expect(isDetailToggle(key({ [m]: true }))).toBe(false);
  });
  it('ignores typing, the wrist screen and open dialogs', () => {
    expect(isDetailToggle(key({ target: { tagName: 'INPUT' } }))).toBe(false);
    expect(isDetailToggle(key({ target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
    expect(isDetailToggle(key(), { wristOwnsKeys: true })).toBe(false);
    expect(isDetailToggle(key(), { dialogOpen: true })).toBe(false);
  });
});

describe('sampling checklist in the default visor', () => {
  const state = (status, checklist = {}) => ({ sampling: { status, checklist } });
  it('shows with a target in view or a step done', () => {
    expect(samplingInProgress(state({ target: { kind: 'rock' } }))).toBe(true);
    expect(samplingInProgress(state(null, { photo: true }))).toBe(true);
    expect(samplingInProgress(state(null, { sample: true }))).toBe(true);
  });
  it('hides while walking with nothing in view', () => {
    expect(samplingInProgress(state(null))).toBe(false);
    expect(samplingInProgress(state({ target: null }, { seal: true }))).toBe(false);
    expect(samplingInProgress({})).toBe(false);
  });
});

describe('visor classes', () => {
  it('adds and removes hud-detail and hud-sampling-on', () => {
    const set = new Set();
    const classList = { toggle: (c, on) => (on ? set.add(c) : set.delete(c)) };
    applyVisorClasses(classList, { detail: true, sampling: true });
    expect([...set].sort()).toEqual(['hud-detail', 'hud-sampling-on']);
    applyVisorClasses(classList, { detail: false, sampling: true });
    expect([...set]).toEqual(['hud-sampling-on']);
  });
});
