import { describe, expect, it } from 'vitest';
import { POPUP_EDGE, POPUP_GAP, placePopup } from './popupPlacement.js';

const box = { width: 900, height: 600 };
const size = { width: 270, height: 240 };
const caption = { left: 14, top: 12, right: 260, bottom: 50 };      // the map's top-left caption
const legend = { left: 16, top: 470, right: 330, bottom: 584 };     // the layer legend, bottom left
const roverKey = { left: 560, top: 540, right: 886, bottom: 586 };  // Perseverance's drives, bottom right
const chrome = [caption, legend, roverKey];
const at = (x, y, w = 120, h = 22) => ({ left: x, top: y - h / 2, right: x + w, bottom: y + h / 2 });
const rect = (p) => ({ left: p.left, top: p.top, right: p.left + size.width, bottom: p.top + size.height });
const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (r) => r.left >= POPUP_EDGE && r.top >= POPUP_EDGE && r.right <= box.width - POPUP_EDGE && r.bottom <= box.height - POPUP_EDGE;

describe('map popup placement (#380)', () => {
  it('opens to the right of its anchor, centred on it, when there is room', () => {
    const anchor = at(300, 300);
    const p = placePopup({ anchor, size, box, avoid: chrome });
    expect(p.side).toBe('right');
    expect(p.left).toBe(anchor.right + POPUP_GAP);
    expect(p.top).toBe(300 - size.height / 2);
    expect(p.covered).toBe(0);
  });

  it('flips to the left near the right edge', () => {
    const anchor = at(700, 300);
    const p = placePopup({ anchor, size, box, avoid: chrome });
    expect(p.side).toBe('left');
    expect(p.left + size.width).toBe(anchor.left - POPUP_GAP);
    expect(inside(rect(p))).toBe(true);
  });

  it('slides down off the caption for a stop near the top left, and never covers the stop label', () => {
    const anchor = at(40, 60);   // the stop marker and its "Perseverance here" tag
    const p = placePopup({ anchor, size, box, avoid: chrome });
    const r = rect(p);
    expect(hits(r, caption)).toBe(false);
    expect(hits(r, anchor)).toBe(false);
    expect(inside(r)).toBe(true);
  });

  it('takes the clear spot nearest its anchor, whatever order the chrome comes in', () => {
    const anchor = at(76, 73, 108);   // Cheyava Falls at the top left, as measured at 1366x768
    const p = placePopup({ anchor, size: { width: 270, height: 260 }, box: { width: 635, height: 660 }, avoid: [{ left: 320, top: 600, right: 620, bottom: 645 }, { left: 15, top: 13, right: 377, bottom: 47 }] });
    expect(p).toMatchObject({ side: 'right', top: 47 + POPUP_GAP, covered: 0 });
  });

  it('slides up off the legend and the rover key for a stop near the bottom', () => {
    const anchor = at(400, 520);
    const p = placePopup({ anchor, size, box, avoid: chrome });
    const r = rect(p);
    for (const c of chrome) expect(hits(r, c)).toBe(false);
    expect(inside(r)).toBe(true);
  });

  it('opens a legend tag\'s details beside the legend card, not over it', () => {
    const tip = { width: 300, height: 90 };
    const p = placePopup({ anchor: legend, size: tip, box, avoid: [caption, roverKey] });
    const r = { left: p.left, top: p.top, right: p.left + tip.width, bottom: p.top + tip.height };
    expect(p.covered).toBe(0);
    expect(hits(r, legend)).toBe(false);
    expect(hits(r, roverKey)).toBe(false);
  });

  it('stays inside the map when nothing is clear, covering as little as it can', () => {
    const small = { width: 300, height: 200 };
    const big = { width: 290, height: 300 };
    const p = placePopup({ anchor: at(150, 100), size: big, box: small });
    expect(p.left).toBeGreaterThanOrEqual(POPUP_EDGE);
    expect(p.top).toBeGreaterThanOrEqual(POPUP_EDGE);
    expect(p.left + big.width).toBeLessThanOrEqual(small.width);
  });
});
