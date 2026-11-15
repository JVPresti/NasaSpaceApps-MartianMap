import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { layerPreview } from './layerPreviews.js';
import './layerPreview.css';

const GAP_PX = 12;
const CARD_WIDTH_PX = 254;   // the image (240 px) with its padding and border, layerPreview.css

/**
 * Preview image of a data layer (#51), shown above its layer button while it is hovered or has keyboard focus: over the
 * panels above the buttons, never over the map's legend beside them. Put it inside the layer's button: it listens to
 * that button, so the panel's markup and layout do not change. The image is drawn in a portal on document.body, because
 * the panel scrolls and would clip it.
 *
 * @param {{ layer: { id: string, name: string } }} props
 */
export default function LayerPreview({ layer }) {
  const anchor = useRef(null);
  const [at, setAt] = useState(null);   // { left, top } in viewport pixels while shown

  useEffect(() => {
    const button = anchor.current && anchor.current.parentElement;
    if (!button) return undefined;
    const show = () => {
      // within the panel that holds the buttons, so the card never reaches the map beside it
      const r = button.getBoundingClientRect();
      const bounds = button.closest('.table-panel, .plan-panel')?.getBoundingClientRect() ?? { left: GAP_PX, right: window.innerWidth - GAP_PX };
      setAt({ left: Math.max(bounds.left, Math.min(r.left, bounds.right - CARD_WIDTH_PX)), top: r.top - GAP_PX });
    };
    const hide = () => setAt(null);
    const onFocus = () => { if (button.matches(':focus-visible')) show(); };   // keyboard focus, not a mouse click
    button.addEventListener('pointerenter', show);
    button.addEventListener('pointerleave', hide);
    button.addEventListener('focus', onFocus);
    button.addEventListener('blur', hide);
    // Picking the layer, by pointer or with Enter or Space, closes the card: the map shows the layer now, and the card
    // would cover the panel above the buttons. pointerdown closes it before the click lands, click covers the keyboard.
    button.addEventListener('pointerdown', hide);
    button.addEventListener('click', hide);
    return () => {
      button.removeEventListener('pointerdown', hide);
      button.removeEventListener('click', hide);
      button.removeEventListener('pointerenter', show);
      button.removeEventListener('pointerleave', hide);
      button.removeEventListener('focus', onFocus);
      button.removeEventListener('blur', hide);
    };
  }, []);

  const img = layerPreview(layer, import.meta.env.BASE_URL);
  return (
    <span ref={anchor} className="layer-preview-anchor" aria-hidden="true">
      {at && createPortal(
        <figure className="layer-preview" style={{ left: at.left, top: at.top }}>
          <img src={img.src} alt="" width={img.width / 2} height={img.height / 2} decoding="async" />
          <figcaption>{layer.name}</figcaption>
        </figure>,
        document.body,
      )}
    </span>
  );
}
