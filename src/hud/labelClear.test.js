import { describe, expect, it } from 'vitest';
import { clearOfRects } from './labelClear.js';

const panel = { left: 100, top: 400, right: 500, bottom: 560 };   // the bottom waypoint panel

describe('waypoint label clear of the HUD panels (#283)', () => {
  it('leaves a label that is already clear where it is', () => {
    const place = { x: 300, y: 200 };
    expect(clearOfRects(place, 60, 30, [panel])).toBe(true);
    expect(place).toEqual({ x: 300, y: 200 });
  });
  it('moves a label just inside the top edge to sit above the panel with a 4 px gap', () => {
    const place = { x: 300, y: 405 };
    expect(clearOfRects(place, 60, 30, [panel])).toBe(true);
    expect(place).toEqual({ x: 300, y: 400 - 15 - 4 });
  });
  it('moves sideways when the side is the shorter way out', () => {
    const place = { x: 110, y: 480 };
    expect(clearOfRects(place, 60, 30, [panel])).toBe(true);
    expect(place.x).toBe(100 - 30 - 4);
  });
  it('reports no clear spot when two panels leave too little room between them', () => {
    const card = { left: 200, top: 330, right: 600, bottom: 395 };   // only 5 px above the panel
    const place = { x: 300, y: 405 };
    expect(clearOfRects(place, 60, 30, [panel, card])).toBe(false);
  });
});
