// Keeps the waypoint world label out from under the HUD panels (#283). Pure geometry plus a small cache, so the label's
// frame loop never reads layout. The panel rectangles are measured once and again only after a resize, a panel change
// or half a second, whichever comes first. The label's own size is measured again when its text changes it.

/**
 * Push `place` ({ x, y }, the label centre in HUD pixels) out of every rectangle it falls inside, along the shorter way,
 * keeping a 4 px gap. Rectangles are { left, top, right, bottom } in the same pixels.
 * @returns {boolean} true when the label ends up clear of every rectangle
 */
export function clearOfRects(place, labelW, labelH, rects) {
  const boxes = rects.map((r) => ({ left: r.left - labelW / 2 - 4, right: r.right + labelW / 2 + 4, top: r.top - labelH / 2 - 4, bottom: r.bottom + labelH / 2 + 4 }));
  const inside = (b) => place.x > b.left && place.x < b.right && place.y > b.top && place.y < b.bottom;
  for (const b of boxes) {
    if (!inside(b)) continue;
    const moves = [[place.x - b.left, 'x', b.left], [b.right - place.x, 'x', b.right], [place.y - b.top, 'y', b.top], [b.bottom - place.y, 'y', b.bottom]];
    const [, axis, to] = moves.reduce((a, c) => (c[0] < a[0] ? c : a));
    place[axis] = to;
  }
  return !boxes.some(inside);
}

export const PANEL_SELECTOR = '.hud .hud-panel, .stop-card-walk, .event-banner-walk';
const MAX_AGE_MS = 500;

/**
 * Cached panel rectangles relative to `hud`, plus the label's size. `get()` measures only when the cache is stale, and
 * a new waypoint name or range that resizes the label makes it stale.
 * @returns {{ get: (label: HTMLElement) => { rects: object[], w: number, h: number }, invalidate: () => void, dispose: () => void }}
 */
export function createPanelRects(hud, { now = () => performance.now() } = {}) {
  let cache = null, at = -Infinity, watched = null;
  const invalidate = () => { cache = null; };
  window.addEventListener('resize', invalidate);
  const sizer = typeof ResizeObserver === 'function' ? new ResizeObserver(invalidate) : null;
  // a panel shown or hidden changes a class on the HUD or its panels, or mounts the card or the alert in the app
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(invalidate) : null;
  if (observer) {
    observer.observe(hud, { attributes: true, attributeFilter: ['class'], subtree: true });
    if (hud.parentElement) observer.observe(hud.parentElement, { childList: true });
  }
  return {
    get(label) {
      if (sizer && label !== watched) { if (watched) sizer.unobserve(watched); sizer.observe(label); watched = label; cache = null; }
      const t = now();
      if (cache && t - at < MAX_AGE_MS) return cache;
      const origin = hud.getBoundingClientRect();
      const rects = [];
      for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
        const r = panel.getBoundingClientRect();
        if (r.width) rects.push({ left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top });
      }
      cache = { rects, w: label.offsetWidth, h: label.offsetHeight };
      at = t;
      return cache;
    },
    invalidate,
    dispose() { window.removeEventListener('resize', invalidate); if (observer) observer.disconnect(); if (sizer) sizer.disconnect(); },
  };
}
