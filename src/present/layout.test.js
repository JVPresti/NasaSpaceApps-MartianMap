import { describe, expect, it } from 'vitest';
import { layoutCards } from './layout.js';

const frame = { w: 1366, h: 768, bottom: 560 };
const box = (it, b) => ({ x: it.x + b.cardX, y: it.y + b.cardY, w: it.w, h: it.h });
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layoutCards', () => {
  it('puts a card above and right of its pin when it fits', () => {
    const [b] = layoutCards([{ x: 400, y: 400, w: 200, h: 80 }], frame);
    expect(b).toEqual({ pinX: 400, pinY: 400, cardX: 20, cardY: -86 });
  });

  it('flips a card to the left of a pin near the right edge, so nothing clips', () => {
    const it0 = { x: 1300, y: 400, w: 300, h: 80 };
    const [b] = layoutCards([it0], frame);
    const r = box({ x: b.pinX, y: b.pinY, w: it0.w, h: it0.h }, b);
    expect(r.x + r.w).toBeLessThanOrEqual(frame.w - 24);
    expect(r.x).toBeGreaterThanOrEqual(24);
  });

  it('keeps cards inside the frame and above the captions', () => {
    const items = [{ x: 10, y: 10, w: 250, h: 90 }, { x: 700, y: 760, w: 250, h: 90 }];
    for (const [k, b] of layoutCards(items, frame).entries()) {
      const r = box({ x: b.pinX, y: b.pinY, w: items[k].w, h: items[k].h }, b);
      expect(r.y).toBeGreaterThanOrEqual(24);
      expect(r.y + r.h).toBeLessThanOrEqual(frame.bottom);
    }
  });

  it('stacks cards whose pins are close instead of overlapping them', () => {
    const items = [{ x: 500, y: 300, w: 330, h: 100 }, { x: 505, y: 310, w: 250, h: 70 }, { x: 498, y: 330, w: 280, h: 70 }];
    const out = layoutCards(items, frame).map((b, k) => box({ x: b.pinX, y: b.pinY, w: items[k].w, h: items[k].h }, b));
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(hits(out[i], out[j]), `${i} ${j}`).toBe(false);
  });

  it('keeps a card already on screen in place when a card listed before it appears later', () => {
    // the plan beat: the bend card shows at 10.5 s, the total's card at 12 s, both near Cheyava Falls
    const bend = { x: 600, y: 300, w: 300, h: 90, start: 10.5 };
    const total = { x: 590, y: 305, w: 300, h: 90, start: 12 };
    const [alone] = layoutCards([bend], frame);
    const [, withTotal] = layoutCards([total, bend], frame);
    expect(withTotal).toEqual(alone);
  });
});
