import { describe, expect, it } from 'vitest';
import {
  STICK_DEAD_ZONE,
  STICK_HIT_SCALE,
  STICK_JOG_FROM,
  STICK_MARGIN_PX,
  STICK_RADIUS_PX,
  createTouchControls,
  stickZone,
} from './touchInput.js';

const VIEWPORT = { width: 1280, height: 720 };
const ZONE = stickZone(VIEWPORT);

/** A touch on the stick centre unless the test moves it. */
const touch = (over = {}) => ({ pointerId: 1, x: ZONE.x, y: ZONE.y, pointerType: 'touch', viewport: VIEWPORT, ...over });

const expectedMagnitude = (pixels) => {
  const raw = Math.min(pixels / STICK_RADIUS_PX, 1);
  return (raw - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
};

describe('stickZone', () => {
  it('places the stick above the bottom edge and enlarges the hit radius', () => {
    const zone = stickZone({ width: 800, height: 600 });
    expect(zone.x).toBe(STICK_MARGIN_PX + STICK_RADIUS_PX);
    expect(zone.y).toBe(600 - STICK_MARGIN_PX - STICK_RADIUS_PX);
    expect(zone.radius).toBe(STICK_RADIUS_PX * STICK_HIT_SCALE);
  });

  it('returns zeros when the viewport is missing or not a positive finite size', () => {
    const zeros = { x: 0, y: 0, radius: 0 };
    expect(stickZone()).toEqual(zeros);
    expect(stickZone(null)).toEqual(zeros);
    expect(stickZone({})).toEqual(zeros);
    expect(stickZone({ width: 0, height: 600 })).toEqual(zeros);
    expect(stickZone({ width: 800, height: -1 })).toEqual(zeros);
    expect(stickZone({ width: Number.NaN, height: 600 })).toEqual(zeros);
  });
});

describe('touch controls', () => {
  it('holds the stick through down, move and up', () => {
    const controls = createTouchControls();
    expect(controls.state()).toEqual({ visible: false, active: false, knobX: 0, knobY: 0, jog: false });

    expect(controls.down(touch())).toEqual({ claimed: true, look: false });
    expect(controls.state().visible).toBe(true);
    expect(controls.state().active).toBe(true);
    expect(controls.owns(1)).toBe(true);
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });

    expect(controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 20 })).toEqual({ changed: true });
    const velocity = controls.velocity();
    expect(velocity.x).toBeCloseTo(0, 12);
    expect(velocity.y).toBeCloseTo(expectedMagnitude(20), 12);
    expect(velocity.jog).toBe(false);
    expect(controls.state().knobY).toBe(-20);

    expect(controls.up(1)).toEqual({ changed: true });
    expect(controls.state()).toEqual({ visible: true, active: false, knobX: 0, knobY: 0, jog: false });
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });
    expect(controls.owns(1)).toBe(false);
  });

  it('reports no movement inside the dead zone but still draws the knob offset', () => {
    const controls = createTouchControls();
    controls.down(touch());
    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 8 });
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });
    expect(controls.state().knobY).toBe(-8);

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - STICK_RADIUS_PX * STICK_DEAD_ZONE });
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 9 });
    expect(controls.velocity().y).toBeGreaterThan(0);
  });

  it('remaps the deflection above the dead zone and reaches full speed at the rim', () => {
    const controls = createTouchControls();
    controls.down(touch());
    controls.move({ pointerId: 1, x: ZONE.x + 30, y: ZONE.y });
    expect(controls.velocity().x).toBeCloseTo(expectedMagnitude(30), 12);

    controls.move({ pointerId: 1, x: ZONE.x + 200, y: ZONE.y });
    expect(controls.state().knobX).toBeCloseTo(STICK_RADIUS_PX, 12);
    expect(controls.velocity().x).toBeCloseTo(1, 12);
    expect(controls.state().jog).toBe(true);
  });

  it('turns jog on only above the threshold', () => {
    const controls = createTouchControls();
    controls.down(touch());
    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 47 });
    expect(controls.velocity().jog).toBe(false);
    expect(47 / STICK_RADIUS_PX).toBeLessThan(STICK_JOG_FROM);

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 48 });
    expect(controls.velocity().jog).toBe(true);
    expect(controls.state().jog).toBe(true);
  });

  it('keeps the knob and the vector inside the base radius', () => {
    const controls = createTouchControls();
    controls.down(touch());
    controls.move({ pointerId: 1, x: ZONE.x - 500, y: ZONE.y + 500 });

    const state = controls.state();
    expect(Math.hypot(state.knobX, state.knobY)).toBeCloseTo(STICK_RADIUS_PX, 12);
    expect(state.knobX).toBeCloseTo(-STICK_RADIUS_PX / Math.SQRT2, 12);
    expect(state.knobY).toBeCloseTo(STICK_RADIUS_PX / Math.SQRT2, 12);

    const velocity = controls.velocity();
    expect(velocity.x).toBeCloseTo(-1 / Math.SQRT2, 12);
    expect(velocity.y).toBeCloseTo(-1 / Math.SQRT2, 12);
    expect(Math.hypot(velocity.x, velocity.y)).toBeLessThanOrEqual(1);
  });

  it('moves forward on an upward drag, right on a rightward drag, and never exceeds one', () => {
    const controls = createTouchControls();
    controls.down(touch());

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 30 });
    expect(controls.velocity().y).toBeGreaterThan(0);
    expect(controls.velocity().x).toBeCloseTo(0, 12);

    controls.move({ pointerId: 1, x: ZONE.x + 30, y: ZONE.y - 30 });
    const diagonal = controls.velocity();
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeGreaterThan(0);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(expectedMagnitude(30 * Math.SQRT2), 12);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(1);

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y + 30 });
    expect(controls.velocity().y).toBeLessThan(0);
  });

  it('treats a first touch outside the base as the look pointer', () => {
    const controls = createTouchControls();
    expect(controls.down(touch({ x: 900, y: 200 }))).toEqual({ claimed: false, look: true });
    expect(controls.state().visible).toBe(true);
    expect(controls.state().active).toBe(false);
    expect(controls.owns(1)).toBe(true);

    controls.move({ pointerId: 1, x: 930, y: 220 });
    expect(controls.consumeLook()).toEqual({ dx: 30, dy: 20 });
    expect(controls.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('lets a second finger look while the first holds the stick', () => {
    const controls = createTouchControls();
    controls.down(touch({ pointerId: 1 }));
    expect(controls.down(touch({ pointerId: 2, x: 900, y: 300 }))).toEqual({ claimed: false, look: true });

    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 40 });
    controls.move({ pointerId: 2, x: 880, y: 310 });
    expect(controls.consumeLook()).toEqual({ dx: -20, dy: 10 });
    expect(controls.consumeLook()).toEqual({ dx: 0, dy: 0 });

    controls.move({ pointerId: 2, x: 880, y: 330 });
    expect(controls.consumeLook()).toEqual({ dx: 0, dy: 20 });
    expect(controls.velocity().y).toBeGreaterThan(0);
    expect(controls.state().active).toBe(true);
  });

  it('claims the stick with a second touch after the first finger started looking', () => {
    const controls = createTouchControls();
    controls.down(touch({ pointerId: 1, x: 900, y: 300 }));
    expect(controls.down(touch({ pointerId: 2 }))).toEqual({ claimed: true, look: false });
    expect(controls.owns(1)).toBe(true);
    expect(controls.state().active).toBe(true);
  });

  it('ignores a third touch and a second touch inside the taken base', () => {
    const controls = createTouchControls();
    controls.down(touch({ pointerId: 1 }));
    expect(controls.down(touch({ pointerId: 2, x: ZONE.x + 10, y: ZONE.y }))).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ pointerId: 3, x: 900, y: 300 }))).toEqual({ claimed: false, look: true });
    expect(controls.down(touch({ pointerId: 4, x: 1000, y: 400 }))).toEqual({ claimed: false, look: false });
    expect(controls.owns(3)).toBe(true);
    expect(controls.owns(4)).toBe(false);
  });

  it('releases the stick on pointercancel and keeps the other pointer', () => {
    const controls = createTouchControls();
    controls.down(touch({ pointerId: 1 }));
    controls.down(touch({ pointerId: 2, x: 900, y: 300 }));
    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 50 });

    expect(controls.cancel(1)).toEqual({ changed: true });
    expect(controls.state().active).toBe(false);
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });
    expect(controls.state().knobX).toBe(0);
    expect(controls.state().knobY).toBe(0);
    expect(controls.owns(1)).toBe(false);
    expect(controls.owns(2)).toBe(true);

    expect(controls.cancel(1)).toEqual({ changed: false });
    expect(controls.cancel(2)).toEqual({ changed: true });
    expect(controls.owns(2)).toBe(false);
  });

  it('clear() zeroes the stick, the look and every pointer id but keeps the stick revealed', () => {
    const controls = createTouchControls();
    controls.down(touch({ pointerId: 1 }));
    controls.down(touch({ pointerId: 2, x: 900, y: 300 }));
    controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 50 });
    controls.move({ pointerId: 2, x: 950, y: 330 });

    controls.clear();
    expect(controls.state()).toEqual({ visible: true, active: false, knobX: 0, knobY: 0, jog: false });
    expect(controls.velocity()).toEqual({ x: 0, y: 0, jog: false });
    expect(controls.consumeLook()).toEqual({ dx: 0, dy: 0 });
    expect(controls.owns(1)).toBe(false);
    expect(controls.owns(2)).toBe(false);
    expect(controls.move({ pointerId: 1, x: ZONE.x, y: ZONE.y - 20 })).toEqual({ changed: false });
    expect(controls.up(2)).toEqual({ changed: false });

    // The ids are forgotten, so a new press with the same id can claim the stick again.
    expect(controls.down(touch({ pointerId: 1 }))).toEqual({ claimed: true, look: false });
  });

  it('keeps the stick hidden when clear() runs before any touch', () => {
    const controls = createTouchControls();
    controls.clear();
    expect(controls.state().visible).toBe(false);
  });

  it('ignores mouse pointers and unknown pointer types', () => {
    const controls = createTouchControls();
    expect(controls.down(touch({ pointerType: 'mouse' }))).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ pointerType: undefined }))).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ pointerType: 'Touch' }))).toEqual({ claimed: false, look: false });
    expect(controls.state().visible).toBe(false);
    expect(controls.owns(1)).toBe(false);

    expect(controls.down(touch({ pointerId: 7, pointerType: 'pen' }))).toEqual({ claimed: true, look: false });
  });

  it('honours custom radius, margin, hit scale, dead zone and jog threshold', () => {
    const viewport = { width: 400, height: 300 };
    const controls = createTouchControls({ radius: 40, margin: 10, hitScale: 2, deadZone: 0, jogFrom: 0.5 });

    // Centre (50, 250); the hit radius is 80, larger than the 40 px drawn base.
    expect(controls.down({ pointerId: 1, x: 50 + 70, y: 250, pointerType: 'touch', viewport }).claimed).toBe(true);
    expect(controls.state().active).toBe(true);

    controls.move({ pointerId: 1, x: 50 + 40, y: 250 });
    expect(controls.state().knobX).toBe(40);
    expect(controls.velocity().x).toBeCloseTo(1, 12);
    expect(controls.velocity().jog).toBe(true);

    controls.move({ pointerId: 1, x: 70, y: 250 });   // 20 px deflection, half of the base, no dead zone
    expect(controls.velocity().x).toBeCloseTo(0.5, 12);
    expect(controls.velocity().jog).toBe(false);
  });

  it('does not throw on odd input', () => {
    const controls = createTouchControls();
    expect(() => controls.down()).not.toThrow();
    expect(controls.down()).toEqual({ claimed: false, look: false });
    expect(controls.down(null)).toEqual({ claimed: false, look: false });
    expect(controls.down('touch')).toEqual({ claimed: false, look: false });
    expect(controls.down({ pointerId: Number.NaN, pointerType: 'touch' })).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ x: Number.NaN }))).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ y: Number.POSITIVE_INFINITY }))).toEqual({ claimed: false, look: false });
    expect(controls.down(touch({ viewport: null }))).toEqual({ claimed: false, look: true });
    expect(controls.state().visible).toBe(true);

    expect(controls.move()).toEqual({ changed: false });
    expect(controls.move(null)).toEqual({ changed: false });
    expect(controls.move({ pointerId: 1, x: Number.NaN, y: 0 })).toEqual({ changed: false });
    expect(controls.move({ pointerId: 99, x: 10, y: 10 })).toEqual({ changed: false });
    expect(controls.up()).toEqual({ changed: false });
    expect(controls.cancel(null)).toEqual({ changed: false });
    expect(controls.owns()).toBe(false);
    expect(controls.owns(null)).toBe(false);
    expect(controls.consumeLook()).toEqual({ dx: 0, dy: 0 });
    expect(controls.state()).toEqual({ visible: true, active: false, knobX: 0, knobY: 0, jog: false });
    expect(() => controls.clear()).not.toThrow();

    // Nonsense options fall back to the defaults instead of poisoning the maths.
    const odd = createTouchControls({ radius: Number.NaN, deadZone: 5, jogFrom: Number.NaN, hitScale: 0, margin: Number.NaN });
    expect(() => odd.down(touch({ viewport: undefined }))).not.toThrow();
    expect(() => odd.move({ pointerId: 1, x: 0, y: 0 })).not.toThrow();
    expect(() => odd.velocity()).not.toThrow();
    expect(Number.isFinite(odd.velocity().x)).toBe(true);
  });
});
