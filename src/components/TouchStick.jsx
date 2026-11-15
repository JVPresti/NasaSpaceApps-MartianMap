import { useEffect, useState } from 'react';
import { STICK_MARGIN_PX, STICK_RADIUS_PX } from '../engine/touchInput.js';
import { coarsePointer } from '../input/device.js';
import './touchStick.css';

const SIZE_PX = 2 * STICK_RADIUS_PX;

// The base is drawn from the same constants the engine uses to place its hit circle, so the visible base and the
// touch area in src/engine/touchInput.js stay aligned. The overlay never takes pointer events: the engine owns input.
const BASE_STYLE = {
  position: 'absolute',
  left: `${STICK_MARGIN_PX}px`,
  bottom: `${STICK_MARGIN_PX}px`,
  width: `${SIZE_PX}px`,
  height: `${SIZE_PX}px`,
};

/**
 * Visual overlay for the Walk touch stick (#103). It renders the state the engine publishes through
 * engine.subscribeTouch and never handles input itself.
 * @param {{
 *   engine?: {
 *     subscribeTouch?: (listener: (state: { visible?: boolean, active?: boolean, knobX?: number, knobY?: number, jog?: boolean }) => void) => (() => void) | void,
 *   } | null,
 * }} props
 */
export default function TouchStick({ engine }) {
  const [stick, setStick] = useState(null);

  useEffect(() => {
    const subscribe = engine?.subscribeTouch;
    if (typeof subscribe !== 'function') return undefined;
    const unsubscribe = subscribe((next) => {
      setStick(next !== null && typeof next === 'object' ? next : null);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [engine]);

  // On a touch screen the stick shows at rest from the start, so a phone player sees where to walk from (#365);
  // elsewhere it appears on the first touch (#103). The engine's hit circle is there either way.
  if (!stick?.visible && !coarsePointer()) return null;

  const knobX = Number.isFinite(stick?.knobX) ? stick.knobX : 0;
  const knobY = Number.isFinite(stick?.knobY) ? stick.knobY : 0;
  const classes = ['touch-stick'];
  if (stick?.active === true) classes.push('on');
  if (stick?.jog === true) classes.push('jog');

  return (
    <div className={classes.join(' ')} aria-hidden="true" style={BASE_STYLE}>
      <div
        className="touch-stick-knob"
        style={{ transform: `translate(-50%, -50%) translate(${knobX}px, ${knobY}px)` }}
      />
    </div>
  );
}
