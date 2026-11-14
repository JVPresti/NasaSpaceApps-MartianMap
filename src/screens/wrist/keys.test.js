import { describe, it, expect } from 'vitest';
import { wristKey } from './keys.js';
import { mapProjection } from './map.js';
import { TILE_WIDTH_M, TILE_DEPTH_M } from '../../hud/minimapGeometry.js';

describe('wrist keyboard ownership', () => {
  it('opens with R and navigates only while open without taking movement or global keys', () => {
    expect(wristKey({ code: 'KeyR' }, false)).toBe('toggle');
    for (const [code, action] of Object.entries({ BracketLeft: 'previous-page', BracketRight: 'next-page', KeyJ: 'next-row', KeyK: 'previous-row', Enter: 'confirm' })) {
      expect(wristKey({ code }, false)).toBeNull();
      expect(wristKey({ code }, true)).toBe(action);
    }
    for (const code of ['KeyM', 'KeyL', 'Digit0', 'Escape', 'KeyP', 'KeyW']) expect(wristKey({ code }, true)).toBeNull();
  });
  it('ignores repeats, modifiers, handled events and typing', () => {
    for (const extra of [{ repeat: true }, { defaultPrevented: true }, { isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { target: { isContentEditable: true } }, ...['INPUT','TEXTAREA','SELECT'].map(tagName => ({ target: { tagName } }))]) {
      expect(wristKey({ code: 'Enter', ...extra }, true)).toBeNull();
    }
  });
  it('takes R from a focused mode button and Enter only while the wrist is open', () => {
    const target = { tagName: 'BUTTON' };
    expect(wristKey({ code: 'KeyR', target }, false)).toBe('toggle');
    expect(wristKey({ code: 'Enter', target }, false)).toBeNull();
    expect(wristKey({ code: 'Enter', target }, true)).toBe('confirm');
  });
});

it('fits the entire real tile with equal metre scale on both axes and north up', () => {
  const rect = { x: 10, y: 20, w: 464, h: 240 }, p = mapProjection(rect);
  const nw = p.point(-TILE_WIDTH_M / 2, -TILE_DEPTH_M / 2);
  const se = p.point(TILE_WIDTH_M / 2, TILE_DEPTH_M / 2);
  expect(nw.x).toBeGreaterThanOrEqual(rect.x);
  expect(nw.y).toBeGreaterThanOrEqual(rect.y);
  expect(se.x).toBeLessThanOrEqual(rect.x + rect.w);
  expect(se.y).toBeLessThanOrEqual(rect.y + rect.h);
  const centre = p.point(0, 0), east = p.point(100, 0), south = p.point(0, 100);
  expect(east.x - centre.x).toBeCloseTo(south.y - centre.y);
  expect(p.point(0, -100).y).toBeLessThan(centre.y);
});
