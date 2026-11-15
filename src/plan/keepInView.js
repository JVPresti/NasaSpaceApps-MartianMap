// Keeps a focused text field in view while the on-screen keyboard opens (#365). The keyboard shrinks the visual
// viewport (window.visualViewport) a moment after the focus, and on Chrome for Android it does not shrink the layout
// viewport, so scrollIntoView alone can leave the field under the keyboard. On focus the field scrolls into view (only
// as far as needed); on every visual viewport resize until it loses focus, its nearest scrolling ancestor scrolls by
// however far the field's bottom sits below the visible area. A desktop keyboard never resizes the viewport.

/** Space kept between the field and the keyboard, CSS pixels. */
export const KEYBOARD_GAP_PX = 16;

/**
 * How far to scroll so a box ends above the visible area's bottom: positive scrolls down, 0 when it already fits.
 * @param {{ top: number, bottom: number }} rect the field, layout viewport pixels
 * @param {{ offsetTop: number, height: number }} visible the visual viewport
 */
export function scrollToFit(rect, visible, gap = KEYBOARD_GAP_PX) {
  const bottom = visible.offsetTop + visible.height - gap;
  if (rect.bottom > bottom) return Math.min(rect.bottom - bottom, Math.max(0, rect.top - visible.offsetTop - gap));
  if (rect.top < visible.offsetTop + gap) return rect.top - visible.offsetTop - gap;
  return 0;
}

function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement;
}

/**
 * @param {HTMLElement} el the focused field
 * @param {VisualViewport | null | undefined} viewport
 * @param {Window | null | undefined} win also resizes with the keyboard when the page asks for it
 *   (index.html: interactive-widget=resizes-content)
 * @returns {() => void} stops following the viewport
 */
export function keepInView(el, viewport = globalThis.window?.visualViewport, win = globalThis.window) {
  const fit = () => {
    if (!viewport) return;
    const delta = scrollToFit(el.getBoundingClientRect(), viewport);
    if (delta) scrollParent(el)?.scrollBy({ top: delta });
  };
  const stop = () => {
    viewport?.removeEventListener('resize', fit);
    win?.removeEventListener?.('resize', fit);
    el.removeEventListener('blur', stop);
  };
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });   // a field already in view stays where it is
  viewport?.addEventListener('resize', fit);
  win?.addEventListener?.('resize', fit);
  el.addEventListener('blur', stop);
  return stop;
}
