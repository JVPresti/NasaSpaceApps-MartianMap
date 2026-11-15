// Where a popup opens on the mission table map: the stop details, the rover's image pin and the source tag details.
// A popup stays inside the map, opens beside its anchor on the side with room (right, then left, then below, then
// above), slides along that side to clear the map's own chrome (the caption, the legend, the rover key) and never
// covers its anchor. When no spot is clear it takes the one that covers the least.
//
// All rectangles are { left, top, right, bottom } in one pixel space, usually the map box's.

export const POPUP_GAP = 10;     // between the popup and its anchor or a piece of chrome
export const POPUP_EDGE = 8;     // between the popup and the map's edge

// The map's chrome: a popup or a source tag's details must not cover these
export const MAP_CHROME = '.table-map-caption, .table-map-legend, .table-map-traverse-key, .table-map-fit';

const area = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * @param {{
 *   anchor: { left: number, top: number, right: number, bottom: number },
 *   size: { width: number, height: number },
 *   box: { width: number, height: number },
 *   avoid?: { left: number, top: number, right: number, bottom: number }[],
 *   gap?: number, edge?: number,
 * }} input
 * @returns {{ left: number, top: number, side: 'right' | 'left' | 'below' | 'above', covered: number }}
 *   covered is the area of chrome and anchor under the popup: 0 when the spot is clear
 */
export function placePopup({ anchor, size, box, avoid = [], gap = POPUP_GAP, edge = POPUP_EDGE }) {
  const { width: w, height: h } = size;
  const maxLeft = Math.max(edge, box.width - w - edge);
  const maxTop = Math.max(edge, box.height - h - edge);
  const clampX = (x) => Math.min(maxLeft, Math.max(edge, x));
  const clampY = (y) => Math.min(maxTop, Math.max(edge, y));
  const blockers = [anchor, ...avoid];
  // along a side, try the anchor-centred spot first, then the spots just past each blocker
  const tops = [clampY((anchor.top + anchor.bottom) / 2 - h / 2), ...avoid.flatMap((r) => [clampY(r.bottom + gap), clampY(r.top - gap - h)])];
  const lefts = [clampX((anchor.left + anchor.right) / 2 - w / 2), ...avoid.flatMap((r) => [clampX(r.right + gap), clampX(r.left - gap - w)])];
  const sides = [
    ['right', anchor.right + gap, null],
    ['left', anchor.left - gap - w, null],
    ['below', null, anchor.bottom + gap],
    ['above', null, anchor.top - gap - h],
  ];

  let best = null;
  for (const [side, x, y] of sides) {
    // a side the popup does not fit on is skipped, so near an edge the popup flips to the other side
    if (x !== null && (x < edge || x + w > box.width - edge)) continue;
    if (y !== null && (y < edge || y + h > box.height - edge)) continue;
    for (const p of x !== null ? tops.map((top) => [x, top]) : lefts.map((left) => [left, y])) {
      const rect = { left: p[0], top: p[1], right: p[0] + w, bottom: p[1] + h };
      const covered = blockers.reduce((sum, r) => sum + area(rect, r), 0);
      if (!best || covered < best.covered) best = { left: p[0], top: p[1], side, covered };
      if (covered === 0) return best;
    }
  }
  if (best) return best;
  // no side fits (a popup wider or taller than the room beside its anchor): inside the map, as clear as possible
  const left = clampX(anchor.right + gap), top = clampY(anchor.top);
  return { left, top, side: 'right', covered: blockers.reduce((sum, r) => sum + area({ left, top, right: left + w, bottom: top + h }, r), 0) };
}

/** An element's rectangle relative to `origin` (a DOMRect). */
export function rectIn(origin, el) {
  const r = el.getBoundingClientRect();
  return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
}

/**
 * The chrome of `map` as rectangles relative to `origin`, without any piece that holds `anchor` (a source tag in the
 * legend opens its details beside the legend, not away from it).
 */
export function chromeRects(map, origin, anchor = null) {
  return [...map.querySelectorAll(MAP_CHROME)]
    .filter((el) => !(anchor && el.contains(anchor)) && el.getBoundingClientRect().width > 0)
    .map((el) => rectIn(origin, el));
}
