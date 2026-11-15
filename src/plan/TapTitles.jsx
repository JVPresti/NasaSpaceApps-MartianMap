import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { coarsePointer } from '../input/device.js';
import './tapTitles.css';
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, TITLE_SHOW_MS, placeTitle, titleTarget } from './tapTitles.js';

/**
 * Shows a title's text on a coarse pointer (#365, tapTitles.js): a tap on a plain element with a title, or a long press
 * on a control. Mount it once per screen that uses titles; it does nothing with a mouse, which already gets the
 * browser's tooltip. The bubble goes into the open modal dialog when there is one, so it sits in the top layer with it.
 */
export default function TapTitles() {
  const [tip, setTip] = useState(null);   // { text, style, host }
  const press = useRef(null);
  const eatClickUntil = useRef(0);

  useEffect(() => {
    const show = (found) => {
      const r = found.el.getBoundingClientRect();
      const host = document.querySelector('dialog[open]') ?? document.body;
      setTip({ text: found.text, style: placeTitle(r, { width: window.innerWidth, height: window.innerHeight }), host });
    };
    const onDown = (event) => {
      setTip(null);
      clearTimeout(press.current?.timer);
      press.current = null;
      if (event.pointerType !== 'touch' && !coarsePointer()) return;
      const found = titleTarget(event.target, 'press');
      if (!found) return;
      press.current = {
        x: event.clientX, y: event.clientY,
        timer: setTimeout(() => { show(found); eatClickUntil.current = Date.now() + 800; }, LONG_PRESS_MS),
      };
    };
    const onMove = (event) => {
      const p = press.current;
      if (p && Math.hypot(event.clientX - p.x, event.clientY - p.y) > LONG_PRESS_SLOP_PX) { clearTimeout(p.timer); press.current = null; }
    };
    const onUp = () => { clearTimeout(press.current?.timer); press.current = null; };
    const onClick = (event) => {
      // the click that ends a long press must not also press the control
      if (Date.now() < eatClickUntil.current) { event.preventDefault(); event.stopPropagation(); eatClickUntil.current = 0; return; }
      if (!coarsePointer()) return;
      const found = titleTarget(event.target, 'tap');
      if (found) show(found);
    };
    const onContext = (event) => { if (coarsePointer() && titleTarget(event.target, 'press')) event.preventDefault(); };
    const close = () => setTip(null);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContext, true);
    window.addEventListener('scroll', close, true);
    return () => {
      clearTimeout(press.current?.timer);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  useEffect(() => {
    if (!tip) return undefined;
    const timer = setTimeout(() => setTip(null), TITLE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [tip]);

  if (!tip) return null;
  return createPortal(<div className="tap-title" role="status" style={tip.style}>{tip.text}</div>, tip.host);
}
