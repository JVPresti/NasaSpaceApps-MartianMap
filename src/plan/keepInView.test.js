import { describe, expect, it, vi } from 'vitest';
import { keepInView, scrollToFit } from './keepInView.js';

function target() {
  const handlers = {};
  return {
    handlers,
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({ top: 100, bottom: 140 }),
    addEventListener: vi.fn((type, fn) => { handlers[type] = fn; }),
    removeEventListener: vi.fn((type, fn) => { if (handlers[type] === fn) delete handlers[type]; }),
  };
}

describe('scrollToFit', () => {
  const visible = { offsetTop: 0, height: 400 };
  it('scrolls down by how far the field ends under the keyboard, with a gap', () => {
    expect(scrollToFit({ top: 560, bottom: 600 }, visible)).toBe(216);
  });
  it('does not push the field above the visible top', () => {
    expect(scrollToFit({ top: 30, bottom: 600 }, visible)).toBe(14);
  });
  it('scrolls up when the field is above the visible area', () => {
    expect(scrollToFit({ top: -50, bottom: -10 }, visible)).toBe(-66);
  });
  it('leaves a field that fits', () => {
    expect(scrollToFit({ top: 100, bottom: 140 }, visible)).toBe(0);
    expect(scrollToFit({ top: 500, bottom: 540 }, { offsetTop: 300, height: 400 })).toBe(0);
  });
});

describe('keepInView', () => {
  it('scrolls the field into view on focus and follows the viewport until blur', () => {
    const el = target();
    const viewport = { ...target(), offsetTop: 0, height: 400 };
    keepInView(el, viewport, null);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(viewport.handlers.resize).toBeTypeOf('function');
    viewport.handlers.resize();   // the field fits: nothing to scroll, nothing thrown
    el.handlers.blur();
    expect(viewport.handlers.resize).toBeUndefined();
  });

  it('works without a visual viewport (an older browser)', () => {
    const el = target();
    expect(() => keepInView(el, null, null)()).not.toThrow();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
