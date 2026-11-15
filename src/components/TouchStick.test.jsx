import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TouchStick from './TouchStick.jsx';
import { STICK_MARGIN_PX, STICK_RADIUS_PX, stickZone } from '../engine/touchInput.js';

// Server rendering runs no effects, so these cover the hidden, null-safe paths; the visible markup needs a live engine.
describe('TouchStick', () => {
  it('renders nothing without an engine or before the stick is visible', () => {
    expect(renderToStaticMarkup(<TouchStick />)).toBe('');
    expect(renderToStaticMarkup(<TouchStick engine={null} />)).toBe('');
    expect(renderToStaticMarkup(<TouchStick engine={{}} />)).toBe('');
    expect(renderToStaticMarkup(<TouchStick engine={{ subscribeTouch: () => () => {} }} />)).toBe('');
  });

  it('accepts an engine without a usable subscribeTouch', () => {
    expect(renderToStaticMarkup(<TouchStick engine={{ subscribeTouch: null }} />)).toBe('');
    expect(renderToStaticMarkup(<TouchStick engine={{ subscribeTouch: 42 }} />)).toBe('');
  });

  it('draws its base over the engine hit zone', () => {
    const zone = stickZone({ width: 800, height: 720 });
    expect(zone.x).toBe(STICK_MARGIN_PX + STICK_RADIUS_PX);
    expect(zone.y).toBe(720 - STICK_MARGIN_PX - STICK_RADIUS_PX);
    expect(zone.radius).toBeGreaterThan(STICK_RADIUS_PX);
  });
});
