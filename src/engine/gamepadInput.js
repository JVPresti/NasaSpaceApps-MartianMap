/**
 * Standard-mapping gamepad input for the walk controls. Plain JavaScript, no DOM: the default poller
 * reads `navigator.getGamepads` only when it polls, and every value is injected for tests.
 *
 * Axes are the standard mapping: 0/1 is the left stick (move) and 2/3 the right stick (look). The
 * buttons used are 4/5 (LB/RB, previous/next layer), 9 (Start/Menu, Plan/Walk), 10 (L3, jog), and
 * the habitat table's two actions (src/state/tableActions.js): 0 (A / Cross, open the plan) and
 * 2 (X / Square, finish the EVA). X mirrors the X key; the EVA's end is kept off A, the button
 * pressed most. Both are reported everywhere; the table acts on them only in the cabin.
 *
 * Conventions match the rest of the engine: moveX right, moveY forward, lookX right and lookY down,
 * so a caller can feed lookX/lookY straight into `look(dx, dy)`. Pads that report another mapping
 * are read with the same indices rather than rejected.
 */

/** Stick deflection below this is treated as centred. */
export const PAD_DEAD_ZONE = 0.12;

/** Standard-mapping button indices, named after the action they trigger. */
export const PAD_BUTTONS = Object.freeze({ openPlan: 0, endEva: 2, layerPrev: 4, layerNext: 5, mode: 9, jog: 10 });

/**
 * Signed dead-zone remap: values inside the dead zone become 0 and the remaining travel is stretched
 * back over [-1, 1], so a stick still reaches full speed at the edge.
 *
 * @param {number} value raw axis value
 * @param {number} [deadZone] ignored radius around the centre
 * @returns {number} value in [-1, 1]; never non-finite
 */
export function applyDeadZone(value, deadZone = PAD_DEAD_ZONE) {
  if (!Number.isFinite(value)) return 0;
  const zone = Number.isFinite(deadZone) ? Math.min(1, Math.max(0, deadZone)) : 0;
  const magnitude = Math.abs(value);
  if (magnitude <= zone) return 0;
  const scaled = zone >= 1 ? 1 : Math.min(1, (magnitude - zone) / (1 - zone));
  return value < 0 ? -scaled : scaled;
}

/**
 * @param {unknown} buttons Gamepad buttons list, usually an array of `{ pressed, value }`
 * @param {number} index standard-mapping button index
 * @returns {boolean} true only when the entry exists and reports `pressed === true`
 */
function buttonDown(buttons, index) {
  if (!buttons || typeof buttons !== 'object') return false;
  const button = buttons[index];
  return !!button && typeof button === 'object' && button.pressed === true;
}

/**
 * @param {unknown} axes Gamepad axes list
 * @param {number} index axis index
 * @returns {number} a finite axis value, or 0 for a missing or garbage entry
 */
function axisAt(axes, index) {
  if (!axes || typeof axes !== 'object') return 0;
  const value = axes[index];
  return Number.isFinite(value) ? value : 0;
}

/**
 * One stick as a unit-bounded pair. The pair is scaled down as a whole, so a diagonal push never has
 * a magnitude above 1 and no component escapes [-1, 1].
 *
 * @param {unknown} axes Gamepad axes list
 * @param {number} xIndex axis index of the horizontal component
 * @param {number} yIndex axis index of the vertical component
 * @param {number} deadZone ignored radius around the centre
 * @returns {{ x: number, y: number }}
 */
function readStick(axes, xIndex, yIndex, deadZone) {
  let x = applyDeadZone(axisAt(axes, xIndex), deadZone);
  let y = applyDeadZone(axisAt(axes, yIndex), deadZone);
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
  }
  return { x, y };
}

/**
 * @returns {{
 *   connected: false, id: null, mapping: '',
 *   moveX: 0, moveY: 0, lookX: 0, lookY: 0, jog: false,
 *   modePressed: false, layerPrevPressed: false, layerNextPressed: false, openPlanPressed: false, endEvaPressed: false,
 *   modeDown: false, layerPrevDown: false, layerNextDown: false, openPlanDown: false, endEvaDown: false,
 * }} a neutral reading for a missing pad
 */
function emptyReading() {
  return {
    connected: false,
    id: null,
    mapping: '',
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    jog: false,
    modePressed: false,
    layerPrevPressed: false,
    layerNextPressed: false,
    openPlanPressed: false,
    endEvaPressed: false,
    modeDown: false,
    layerPrevDown: false,
    layerNextDown: false,
    openPlanDown: false,
    endEvaDown: false,
  };
}

/**
 * @param {unknown} pad Gamepad, or null
 * @param {unknown} previous held flags from the last reading, if any
 * @param {number} deadZone ignored radius around the centre
 */
function readPadState(pad, previous, deadZone) {
  if (!pad || typeof pad !== 'object') return emptyReading();

  const buttons = pad.buttons;
  const left = readStick(pad.axes, 0, 1, deadZone);
  const right = readStick(pad.axes, 2, 3, deadZone);

  const modeDown = buttonDown(buttons, PAD_BUTTONS.mode);
  const layerPrevDown = buttonDown(buttons, PAD_BUTTONS.layerPrev);
  const layerNextDown = buttonDown(buttons, PAD_BUTTONS.layerNext);
  const openPlanDown = buttonDown(buttons, PAD_BUTTONS.openPlan);
  const endEvaDown = buttonDown(buttons, PAD_BUTTONS.endEva);
  const was = previous && typeof previous === 'object' ? previous : null;

  return {
    connected: true,
    id: typeof pad.id === 'string' ? pad.id : '',
    mapping: typeof pad.mapping === 'string' ? pad.mapping : '',
    moveX: left.x,
    // A stick pushed up is negative in the standard mapping, the walk input wants forward positive.
    // `+ 0` keeps a centred stick at 0 instead of the -0 that negating zero would produce.
    moveY: -left.y + 0,
    lookX: right.x,
    // Positive dy looks down, matching the engine's look(dx, dy).
    lookY: right.y,
    jog: buttonDown(buttons, PAD_BUTTONS.jog),
    modePressed: modeDown && !was?.modeDown,
    layerPrevPressed: layerPrevDown && !was?.layerPrevDown,
    layerNextPressed: layerNextDown && !was?.layerNextDown,
    openPlanPressed: openPlanDown && !was?.openPlanDown,
    endEvaPressed: endEvaDown && !was?.endEvaDown,
    modeDown,
    layerPrevDown,
    layerNextDown,
    openPlanDown,
    endEvaDown,
  };
}

/**
 * @param {unknown} pad Gamepad, or null/undefined
 * @param {unknown} [previous] held flags from the last reading; pass the previous result to get
 * rising edges, or null on the first reading
 * @returns {{
 *   connected: boolean,
 *   id: string | null,
 *   mapping: string,
 *   moveX: number,
 *   moveY: number,
 *   lookX: number,
 *   lookY: number,
 *   jog: boolean,
 *   modePressed: boolean,
 *   layerPrevPressed: boolean,
 *   layerNextPressed: boolean,
 *   openPlanPressed: boolean,
 *   endEvaPressed: boolean,
 *   modeDown: boolean,
 *   layerPrevDown: boolean,
 *   layerNextDown: boolean,
 *   openPlanDown: boolean,
 *   endEvaDown: boolean,
 * }}
 */
export function readPad(pad, previous = null) {
  return readPadState(pad, previous, PAD_DEAD_ZONE);
}

/**
 * Frame-loop poller for one standard gamepad. It keeps the held flags so each button press is
 * reported once, and tracks whether the pad has been used so a UI can show its hint a single time.
 *
 * @param {{
 *   getPads?: () => unknown,
 *   deadZone?: number,
 * }} [options] `getPads` defaults to the injected-safe `navigator.getGamepads`, read at poll time
 * @returns {{
 *   poll: () => {
 *     connected: boolean, moveX: number, moveY: number, lookX: number, lookY: number,
 *     jog: boolean, actions: string[], used: boolean, firstUse: boolean,
 *   },
 *   reset: () => void,
 *   isUsed: () => boolean,
 * }}
 */
export function createGamepadPoller({
  getPads = () => globalThis.navigator?.getGamepads?.() ?? [],
  deadZone = PAD_DEAD_ZONE,
} = {}) {
  let previous = null;
  let used = false;

  function safePads() {
    try {
      return typeof getPads === 'function' ? getPads() : null;
    } catch {
      return null; // a browser may refuse the call, and a dead pad must not break the frame
    }
  }

  /** @returns {unknown} the first non-null entry of the pad list, or null */
  function pickPad() {
    const list = safePads();
    if (!list || typeof list !== 'object') return null;
    const length = Number.isFinite(list.length) ? Math.max(0, Math.floor(list.length)) : 0;
    for (let i = 0; i < length; i += 1) {
      const pad = list[i];
      if (pad) return pad;
    }
    return null;
  }

  function poll() {
    const pad = pickPad();
    if (!pad) {
      // No pad: neutral output, no edges, and `used` is left alone so a resume does not re-hint.
      return {
        connected: false,
        moveX: 0,
        moveY: 0,
        lookX: 0,
        lookY: 0,
        jog: false,
        actions: [],
        used,
        firstUse: false,
      };
    }

    let reading;
    try {
      reading = readPadState(pad, previous, deadZone);
    } catch {
      reading = readPadState(null, null, deadZone); // a hostile pad object must not break the frame
    }

    previous = {
      modeDown: reading.modeDown,
      layerPrevDown: reading.layerPrevDown,
      layerNextDown: reading.layerNextDown,
      openPlanDown: reading.openPlanDown,
      endEvaDown: reading.endEvaDown,
    };

    const active = reading.modeDown || reading.layerPrevDown || reading.layerNextDown || reading.jog
      || reading.openPlanDown || reading.endEvaDown
      || reading.moveX !== 0 || reading.moveY !== 0 || reading.lookX !== 0 || reading.lookY !== 0;
    const firstUse = active && !used;
    if (active) used = true;

    const actions = [];
    if (reading.modePressed) actions.push('mode');
    if (reading.layerPrevPressed) actions.push('layer-prev');
    if (reading.layerNextPressed) actions.push('layer-next');
    if (reading.openPlanPressed) actions.push('open-plan');
    if (reading.endEvaPressed) actions.push('end-eva');

    return {
      connected: reading.connected,
      moveX: reading.moveX,
      moveY: reading.moveY,
      lookX: reading.lookX,
      lookY: reading.lookY,
      jog: reading.jog,
      actions,
      used,
      firstUse,
    };
  }

  return {
    poll,
    /** Forget the held flags and the use flag, so a held button cannot fire on resume. */
    reset() {
      previous = null;
      used = false;
    },
    isUsed: () => used,
  };
}
