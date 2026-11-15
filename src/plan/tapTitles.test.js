import { describe, expect, it } from 'vitest';
import { placeTitle, titleTarget } from './tapTitles.js';

// A tiny element: closest() walks up the parents and matches a few selector parts, enough for these cases.
function el(tag, attrs = {}, parent = null) {
  const node = {
    tag, attrs, parent,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    closest(selector) {
      const parts = selector.split(',').map((p) => p.trim());
      for (let n = node; n; n = n.parent) {
        if (parts.some((p) => (p === '[title]' ? 'title' in n.attrs : p === '[tabindex]' ? 'tabindex' in n.attrs : p === n.tag))) return n;
      }
      return null;
    },
  };
  return node;
}

describe('titleTarget', () => {
  it('shows the title of a plain element on a tap', () => {
    const row = el('div', { title: 'Oxygen the crew carries' });
    const span = el('span', {}, row);
    expect(titleTarget(span, 'tap')).toEqual({ el: row, text: 'Oxygen the crew carries' });
  });

  it('leaves a tap on a control to the control, and shows its title on a long press', () => {
    const button = el('button', { title: 'Open the science card' });
    expect(titleTarget(button, 'tap')).toBeNull();
    expect(titleTarget(button, 'press')).toEqual({ el: button, text: 'Open the science card' });
  });

  it('ignores elements without a title or with an empty one', () => {
    expect(titleTarget(el('div'), 'tap')).toBeNull();
    expect(titleTarget(el('div', { title: '  ' }), 'press')).toBeNull();
    expect(titleTarget(null, 'tap')).toBeNull();
  });
});

describe('placeTitle', () => {
  const view = { width: 390, height: 844 };
  it('goes under an element in the upper part of the screen', () => {
    expect(placeTitle({ left: 20, top: 100, bottom: 120 }, view)).toEqual({ left: 20, top: 126, maxWidth: 280 });
  });
  it('goes over an element low on the screen and stays inside the width', () => {
    expect(placeTitle({ left: 300, top: 700, bottom: 720 }, view)).toEqual({ left: 102, bottom: 150, maxWidth: 280 });
  });
});
