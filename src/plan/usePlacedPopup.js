import { useLayoutEffect, useRef, useState } from 'react';
import { chromeRects, placePopup, rectIn } from './popupPlacement.js';

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
      const others = [...map.querySelectorAll('.map-pop')].filter((el) => el !== pop).map((el) => rectIn(origin, el));
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
