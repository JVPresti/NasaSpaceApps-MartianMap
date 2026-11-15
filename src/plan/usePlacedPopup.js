import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAP_CHROME, POPUP_EDGE, chromeRects, placePopup, rectIn } from './popupPlacement.js';

/**
 * Places a popup inside its .table-map with placePopup: beside the anchor, clear of the map's chrome and of any other
 * open popup. Measures again when the map or the popup changes size (an image loading, a resize).
 * @param {() => Element | null} getAnchor the element the popup belongs to
 * @param {unknown[]} deps what moves the anchor or changes the popup (the open item, the map view)
 * @returns {[import('react').RefObject<HTMLElement>, import('react').CSSProperties]} the popup's ref and style
 */
export function usePlacedPopup(getAnchor, deps) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const pop = ref.current;
    const map = pop?.closest('.table-map');
    if (!pop || !map) return undefined;
    const place = () => {
      const anchorEl = getAnchor();
      if (!anchorEl) return;
      const origin = map.getBoundingClientRect();
      // other open popups and the stop and pin labels, which a popup should leave readable when it can
      const others = [...map.querySelectorAll('.map-pop, .map-marker-hit, .map-pin-hit')].filter((el) => el !== pop && el !== anchorEl).map((el) => rectIn(origin, el));
      const next = placePopup({
        anchor: rectIn(origin, anchorEl),
        size: { width: pop.offsetWidth, height: pop.offsetHeight },
        box: { width: map.clientWidth, height: map.clientHeight },
        avoid: [...chromeRects(map, origin), ...others],
      });
      setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    };
    place();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(place);
    observer.observe(map);
    observer.observe(pop);
    return () => observer.disconnect();
  }, deps);
  const style = pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' };
  return [ref, style];
}

// Where a source tag's details open when the tag is on the map (#380). The details are the shared SourceTag's own
// portal, placed against the window; on the map they move beside the tag, or beside the legend card that holds it,
// inside the map and clear of its chrome. The open tag is found by its hover, focus or open state: the tap that opens
// it on a phone (#365) leaves no hover and, on some phones, no focus, so SourceTag marks the open tag itself.
function placeTip(map, tip) {
  const tag = map.querySelector('.source-tag-interactive:hover, .source-tag-interactive:focus, .source-tag-open');
  if (!tag) return;
  const origin = map.getBoundingClientRect();
  tip.style.maxWidth = `${Math.min(360, map.clientWidth - 2 * POPUP_EDGE)}px`;
  const card = tag.closest(MAP_CHROME);
  const p = placePopup({
    anchor: rectIn(origin, card ?? tag),
    size: { width: tip.offsetWidth, height: tip.offsetHeight },
    box: { width: map.clientWidth, height: map.clientHeight },
    avoid: [...chromeRects(map, origin, tag), ...[...map.querySelectorAll('.map-pop, .map-marker-hit, .map-pin-hit')].map((el) => rectIn(origin, el))],
  });
  tip.style.left = `${origin.left + p.left}px`;
  tip.style.top = `${origin.top + p.top}px`;
  tip.style.bottom = 'auto';
}

/** Moves any source tag details that open for a tag inside `mapRef`'s map. */
export function useMapTipPlacement(mapRef) {
  useEffect(() => {
    if (typeof MutationObserver !== 'function') return undefined;
    const observer = new MutationObserver((records) => {
      const map = mapRef.current;
      if (!map) return;
      for (const r of records) for (const node of r.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains('source-tag-tip')) placeTip(map, node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mapRef]);
}
