/**
 * Touch controls for Walk mode (#103): a fixed stick in the bottom-left corner and a look finger anywhere else.
 * Plain JavaScript, no DOM and no three.js: the engine owns every pointer listener and feeds pointer data in, so the
 * same module can be tested without a browser and the TouchStick overlay only draws state().
 *
 * One touch holds the stick; another touch outside the stick looks. A third touch is ignored. All distances and
 * offsets are CSS px in viewport coordinates, and screen y grows downwards, so forward movement is minus y.
 */

/** Drawn base circle radius, CSS px. */
export const STICK_RADIUS_PX = 56;
/** Gap from the left and bottom screen edges, CSS px. */
export const STICK_MARGIN_PX = 24;
/** Fraction of the radius below which the stick reports no movement. */
export const STICK_DEAD_ZONE = 0.15;
/** Raw deflection above which the stick reports jog. */
export const STICK_JOG_FROM = 0.85;
/** The touch hit area is a little larger than the drawn base. */
export const STICK_HIT_SCALE = 1.35;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isSize = (value) => isFiniteNumber(value) && value > 0;
const isTouchType = (value) => value === 'touch' || value === 'pen';
const isPoint = (x, y) => isFiniteNumber(x) && isFiniteNumber(y);

function positive(value, fallback) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

function within(value, fallback, min, max) {
  return isFiniteNumber(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function zoneOf(viewport, margin, radius, hitScale) {
  const size = viewport !== null && typeof viewport === 'object' ? viewport : {};
  if (!isSize(size.width) || !isSize(size.height)) return { x: 0, y: 0, radius: 0 };
  return {
    x: margin + radius,
    y: size.height - margin - radius,
    radius: radius * hitScale,
  };
}

/**
 * Centre of the drawn stick and its touch hit radius, in CSS px from the top-left of the viewport.
 * @param {{ width?: number, height?: number } | null} [viewport] canvas size in CSS px
 * @returns {{ x: number, y: number, radius: number }} zeros when the viewport is not a positive finite size
 */
export function stickZone(viewport) {
  return zoneOf(viewport, STICK_MARGIN_PX, STICK_RADIUS_PX, STICK_HIT_SCALE);
}

/**
 * Creates the touch stick and look tracker. The engine routes pointerdown/move/up/cancel here, reads velocity() for
 * movement, consumeLook() for drag-to-look pixels, and state() for the visual overlay.
 *
 * @param {{
 *   radius?: number,
 *   deadZone?: number,
 *   jogFrom?: number,
 *   hitScale?: number,
 *   margin?: number,
 * }} [options] distances in CSS px; deadZone and jogFrom are fractions of the radius
 * @returns {{
 *   down: (pointer: { pointerId?: number, x?: number, y?: number, pointerType?: string, viewport?: { width?: number, height?: number } | null }) => { claimed: boolean, look: boolean },
 *   move: (pointer: { pointerId?: number, x?: number, y?: number }) => { changed: boolean },
 *   up: (pointerId?: number) => { changed: boolean },
 *   cancel: (pointerId?: number) => { changed: boolean },
 *   clear: () => void,
 *   owns: (pointerId?: number) => boolean,
 *   velocity: () => { x: number, y: number, jog: boolean },
 *   consumeLook: () => { dx: number, dy: number },
 *   state: () => { visible: boolean, active: boolean, knobX: number, knobY: number, jog: boolean },
 * }}
 */
export function createTouchControls({
  radius = STICK_RADIUS_PX,
  deadZone = STICK_DEAD_ZONE,
  jogFrom = STICK_JOG_FROM,
  hitScale = STICK_HIT_SCALE,
  margin = STICK_MARGIN_PX,
} = {}) {
  const radiusPx = positive(radius, STICK_RADIUS_PX);
  const hitScaleFactor = positive(hitScale, STICK_HIT_SCALE);
  const marginPx = isFiniteNumber(margin) ? margin : STICK_MARGIN_PX;
  const deadZoneRatio = within(deadZone, STICK_DEAD_ZONE, 0, 0.95);
  const jogFromRatio = within(jogFrom, STICK_JOG_FROM, 0, 1);

  // Revealed by the first accepted touch and kept revealed: a player who has used touch keeps the stick on screen.
  let visible = false;
  let stickId = null;
  let stickX = 0;          // stick centre in viewport CSS px, fixed for the duration of the hold
  let stickY = 0;
  let knobX = 0;           // knob offset from that centre, already clamped to radiusPx
  let knobY = 0;
  let lookId = null;
  let lookX = 0;           // last look pointer position, for accumulating pixel deltas
  let lookY = 0;
  let lookDX = 0;          // pixels not yet claimed by consumeLook()
  let lookDY = 0;

  /** Applies one move to the stick knob, clamped so the knob never leaves the drawn base. */
  function applyStick(x, y) {
    const dx = x - stickX;
    const dy = y - stickY;
    const length = Math.hypot(dx, dy);
    const scale = length > radiusPx ? radiusPx / length : 1;
    knobX = dx * scale;
    knobY = dy * scale;
  }

  /**
   * @param {{ pointerId?: number, x?: number, y?: number, pointerType?: string, viewport?: { width?: number, height?: number } | null } | null} [pointer]
   * @returns {{ claimed: boolean, look: boolean }} claimed for the stick, look for the look finger
   */
  function down(pointer) {
    if (pointer === null || typeof pointer !== 'object') return { claimed: false, look: false };
    const { pointerId, x, y, pointerType, viewport } = pointer;
    if (!isTouchType(pointerType) || !isFiniteNumber(pointerId)) return { claimed: false, look: false };

    // A repeated down for a pointer that already has a role keeps that role instead of stealing another one.
    if (stickId !== null && pointerId === stickId) return { claimed: true, look: false };
    if (lookId !== null && pointerId === lookId) return { claimed: false, look: true };
    if (!isPoint(x, y)) return { claimed: false, look: false };

    visible = true;
    const zone = zoneOf(viewport, marginPx, radiusPx, hitScaleFactor);
    const inStick = zone.radius > 0 && Math.hypot(x - zone.x, y - zone.y) <= zone.radius;
    if (inStick) {
      if (stickId !== null) return { claimed: false, look: false };
      stickId = pointerId;
      stickX = zone.x;
      stickY = zone.y;
      knobX = 0;  // a press alone does not move: the player has to drag away from the centre
      knobY = 0;
      return { claimed: true, look: false };
    }
    if (lookId !== null) return { claimed: false, look: false };
    lookId = pointerId;
    lookX = x;
    lookY = y;
    return { claimed: false, look: true };
  }

  /**
   * @param {{ pointerId?: number, x?: number, y?: number } | null} [pointer]
   * @returns {{ changed: boolean }} false for unknown pointers and unusable coordinates
   */
  function move(pointer) {
    if (pointer === null || typeof pointer !== 'object') return { changed: false };
    const { pointerId, x, y } = pointer;
    if (!isPoint(x, y)) return { changed: false };
    if (stickId !== null && pointerId === stickId) {
      applyStick(x, y);
      return { changed: true };
    }
    if (lookId !== null && pointerId === lookId) {
      lookDX += x - lookX;
      lookDY += y - lookY;
      lookX = x;
      lookY = y;
      return { changed: true };
    }
    return { changed: false };
  }

  /**
   * Releases the stick or the look pointer. Other pointers keep their roles.
   * @param {number} [pointerId]
   * @returns {{ changed: boolean }}
   */
  function release(pointerId) {
    if (stickId !== null && pointerId === stickId) {
      stickId = null;
      knobX = 0;
      knobY = 0;
      stickX = 0;
      stickY = 0;
      return { changed: true };
    }
    if (lookId !== null && pointerId === lookId) {
      lookId = null;
      return { changed: true };
    }
    return { changed: false };
  }

  const up = release;
  const cancel = release;

  /** Zeroes every pointer and the stick, as when a menu disables input. The stick stays revealed. */
  function clear() {
    stickId = null;
    lookId = null;
    knobX = 0;
    knobY = 0;
    stickX = 0;
    stickY = 0;
    lookX = 0;
    lookY = 0;
    lookDX = 0;
    lookDY = 0;
  }

  /** @param {number} [pointerId] @returns {boolean} true while that pointer is the stick or the look pointer */
  function owns(pointerId) {
    return (stickId !== null && pointerId === stickId) || (lookId !== null && pointerId === lookId);
  }

  /**
   * Analogue movement in the range -1..1, with x to the right and y forward.
   * @returns {{ x: number, y: number, jog: boolean }}
   */
  function velocity() {
    if (stickId === null) return { x: 0, y: 0, jog: false };
    const length = Math.hypot(knobX, knobY);
    const raw = Math.min(length / radiusPx, 1);
    const jog = raw > jogFromRatio;
    if (raw <= deadZoneRatio || length === 0) return { x: 0, y: 0, jog };
    // Remap [deadZone, 1] to [0, 1] so the first movement is gentle and the rim is full speed.
    const magnitude = (raw - deadZoneRatio) / (1 - deadZoneRatio);
    const scale = magnitude / length;
    return { x: knobX * scale, y: knobY === 0 ? 0 : -knobY * scale, jog };
  }

  /** @returns {{ dx: number, dy: number }} look pixels since the last call, then zero */
  function consumeLook() {
    const dx = lookDX;
    const dy = lookDY;
    lookDX = 0;
    lookDY = 0;
    return { dx, dy };
  }

  /** @returns {{ visible: boolean, active: boolean, knobX: number, knobY: number, jog: boolean }} the overlay state */
  function state() {
    return { visible, active: stickId !== null, knobX, knobY, jog: velocity().jog };
  }

  return { down, move, up, cancel, clear, owns, velocity, consumeLook, state };
}
