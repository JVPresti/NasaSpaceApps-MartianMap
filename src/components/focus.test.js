import { describe, expect, it } from 'vitest';
import { focusTarget, isUsableControl } from './focus.js';

// The focus rules run on plain DOM objects; a control only needs disabled, closest and getClientRects.
const control = (overrides = {}) => ({
  disabled: false,
  getClientRects: () => [{}],
  closest: () => null,
  ...overrides,
});

describe('isUsableControl', () => {
  it('accepts an enabled, rendered control', () => {
    expect(isUsableControl(control())).toBe(true);
  });

  it('rejects a missing, disabled or hidden control', () => {
    expect(isUsableControl(null)).toBe(false);
    expect(isUsableControl(control({ disabled: true }))).toBe(false);
    expect(isUsableControl(control({ getClientRects: () => [] }))).toBe(false);
  });

  it('rejects a control inside an inert subtree, such as the view switch while busy', () => {
    expect(isUsableControl(control({ closest: (selector) => (selector === '[inert]' ? {} : null) }))).toBe(false);
  });

  it('accepts an element without layout information, such as the dialog itself', () => {
    expect(isUsableControl({ disabled: false })).toBe(true);
  });
});

describe('focusTarget', () => {
  it('focuses the marked primary action when it can take focus', () => {
    const primary = control();
    expect(focusTarget(primary, [control()])).toBe(primary);
  });

  it('falls back to the first usable control when the primary is disabled', () => {
    // This is the pause menu opened while the browser answers a resume: Resume is disabled, so the
    // dialog must focus something else instead of leaving focus on the <dialog> and killing Enter.
    const first = control();
    expect(focusTarget(control({ disabled: true }), [control({ disabled: true }), first])).toBe(first);
  });

  it('returns null when no control can take focus', () => {
    expect(focusTarget(control({ disabled: true }), [control({ getClientRects: () => [] }), null])).toBeNull();
  });
});
