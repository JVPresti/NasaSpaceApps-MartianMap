// Where the presentation's label cards go (#291): beside their ground point, inside the frame, clear of the caption
// band at the bottom and of each other. Plain JavaScript so tests can run it without a browser.

const GAP = 20;      // pin to card, px
const MARGIN = 24;   // card to frame edge, px
const SPACE = 8;     // card to card, px

const overlaps = (a, b) => a.x < b.x + b.w + SPACE && b.x < a.x + a.w + SPACE && a.y < b.y + b.h + SPACE && b.y < a.y + a.h + SPACE;

/**
 * @param {Array<{ x: number, y: number, w: number, h: number, below?: boolean }>} items pin points and card sizes, in
 *   the order they appear (earlier cards keep their place)
 * @param {{ w: number, h: number, bottom?: number }} frame bottom: the top of the caption band, px
 * @returns {Array<{ pinX: number, pinY: number, cardX: number, cardY: number }>} the pin inside the frame, and the
 *   card's top-left corner relative to the pin
 */
export function layoutCards(items, frame) {
  const bottom = frame.bottom ?? frame.h * 0.7;
  const placed = [];
  return items.map((it) => {
    const pinX = Math.max(MARGIN, Math.min(frame.w - MARGIN, it.x));
    const pinY = Math.max(MARGIN, Math.min(bottom, it.y));
    // right of the pin, or left of it when the right side would leave the frame
    let x = pinX + GAP;
    if (x + it.w > frame.w - MARGIN) x = Math.max(MARGIN, pinX - GAP - it.w);
    // above the pin (below for `below`), then inside the frame and above the captions
    let y = it.below ? pinY + 14 : pinY - 6 - it.h;
    const clampY = (v) => Math.max(MARGIN, Math.min(bottom - it.h, v));
    y = clampY(y);
    // step away from cards already placed: below them first, above them if that runs into the captions
    for (let pass = 0; pass < placed.length + 1; pass++) {
      const hit = placed.find((b) => overlaps({ x, y, w: it.w, h: it.h }, b));
      if (!hit) break;
      const down = hit.y + hit.h + SPACE;
      y = down + it.h <= bottom ? down : clampY(hit.y - SPACE - it.h);
      if (placed.some((b) => b !== hit && overlaps({ x, y, w: it.w, h: it.h }, b)) && pass === placed.length) {
        // no free row in this column: move to the other side of the pin
        x = x > pinX ? Math.max(MARGIN, pinX - GAP - it.w) : Math.min(frame.w - MARGIN - it.w, pinX + GAP);
      }
    }
    placed.push({ x, y, w: it.w, h: it.h });
    return { pinX, pinY, cardX: x - pinX, cardY: y - pinY };
  });
}
