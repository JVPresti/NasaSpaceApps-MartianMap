// Wrist screen app integration (#67): the engine side of the screen the interface draws into.
//
// The app owns the canvas: it paints the pages, calls engine.invalidateWristScreen() after a change and sends
// the pointer with engine.setWristPointer(). The engine raises the left arm, points the right index finger at the
// pixel, pinches to confirm and hands the arm back when the wrist comes down. No new models and no new poses:
// the existing 'screen' placement with its 'point' and 'pinch' finger clips.
//
// Geometry from assets_astronaut/arms.json ("wrist_screen") and the bench's arms.tapTarget(): the screen is
// 512 x 352 px, 0.116 m along arm-local z (canvas x) by 0.08 m along arm-local x (canvas y), centred at
// arm-local [0, 0.0806, -0.213] with its normal along +y. This module is free of three.js so the mapping and
// the open/close rules can be tested on their own (arms.js and index.js do the drawing side).

export const WRIST_WIDTH = 512;
export const WRIST_HEIGHT = 352;
export const SCREEN_CENTRE_Y_M = 0.0806;   // arms.json wrist_screen.centre_in_arm_local
export const SCREEN_CENTRE_Z_M = -0.213;
export const SCREEN_WIDTH_M = 0.116;       // along arm-local z, the canvas x axis
export const SCREEN_HEIGHT_M = 0.08;       // along arm-local x, the canvas y axis
export const FINGER_HOVER_M = 0.014;       // pointing: the fingertip hovers 14 mm above the glass
export const FINGER_TAP_M = 0.001;         // confirming: it pinches down to 1 mm for TAP_SECONDS
export const TAP_SECONDS = 0.25;
export const WRIST_POSES = ['down', 'point', 'tool', 'open', 'pinch'];   // arms.js P keys that an arm can hold

const LAYER_ROWS = 5;   // arms.js LAYER_NAMES
const LAYER_ROW_TOP = 74, LAYER_ROW_STEP = 52, LAYER_ROW_LABEL = 20, LAYER_COLUMN_X = 350;   // arms.draw() layer list

/**
 * Canvas pixel at the centre of a layer row of the built-in fallback list, where the bench's finger rests.
 * @param {number} row 0 to 4 (LAYER_NAMES in arms.js)
 * @returns {{ x: number, y: number }} pixel, x 0..512, y 0..352
 */
export function layerRowPointer(row) {
  const i = Number.isFinite(row) ? Math.max(0, Math.min(LAYER_ROWS - 1, row | 0)) : 0;
  return { x: LAYER_COLUMN_X, y: LAYER_ROW_TOP + i * LAYER_ROW_STEP + LAYER_ROW_LABEL };
}

/**
 * Keep a pointer inside the screen and fill in what the interface left out.
 * @param {{ x?: number, y?: number, pressed?: boolean }} [pointer] pixel x 0..512, y 0..352, y down
 * @returns {{ x: number, y: number, pressed: boolean }}
 */
export function clampWristPointer(pointer = {}) {
  const axis = (n, size) => (Number.isFinite(n) ? Math.min(size, Math.max(0, n)) : size / 2);
  return { x: axis(pointer.x, WRIST_WIDTH), y: axis(pointer.y, WRIST_HEIGHT), pressed: pointer.pressed === true };
}

/**
 * Canvas pixel to the arm-local point on the glass under it (before the left arm's placement).
 * Mirrors arms.tapTarget() in the bench: canvas y runs along arm-local x, canvas x along arm-local z.
 * @param {number} x pixel 0..512, 0 at the left edge; out of range is clamped
 * @param {number} y pixel 0..352, 0 at the top edge; out of range is clamped
 * @returns {{ x: number, z: number }} arm-local metres on the glass: x -0.04 (top edge) to 0.04 (bottom edge),
 *   z -0.155 (left edge) to -0.271 (right edge)
 */
export function wristPixelToLocal(x, y) {
  const p = clampWristPointer({ x, y });
  return {
    x: (p.y / WRIST_HEIGHT - 0.5) * SCREEN_HEIGHT_M,
    z: SCREEN_CENTRE_Z_M - (p.x / WRIST_WIDTH - 0.5) * SCREEN_WIDTH_M,
  };
}

/**
 * Height of the fingertip above the glass. It pinches down while a confirm is showing and hovers otherwise.
 * @param {number} tap seconds left of the confirm
 */
export const fingerHover = (tap) => (tap > 0 ? FINGER_TAP_M : FINGER_HOVER_M);

/** True while the wrist screen is raised (arms.state). Sampling ignores its inputs then. */
export const wristIsOpen = (armsState) => armsState === 'screen';

/**
 * May the wrist open now? Only once the scene is ready, in Walk (the arms are not drawn in Plan), with no arm
 * clip playing and in a sampling phase that owns no clip: idle, or holding a sample in the scoop.
 * @param {{ ready: boolean, mode: 'walk' | 'plan', clip: string | null, phase: string }} s
 * @returns {boolean}
 */
export function canOpenWrist({ ready, mode, clip, phase }) {
  return Boolean(ready) && mode === 'walk' && !clip && (phase === 'idle' || phase === 'holding');
}

/**
 * Pose the arm goes back to when the wrist comes down: the tool hold while a sample is in the scoop (or a clip
 * owns the arm), otherwise the pose the player had before raising it, and 'down' when there is none.
 * @param {{ phase: string, clip: string | null, previous: string | null }} s
 * @returns {'down' | 'point' | 'tool' | 'open' | 'pinch'}
 */
export function wristRestoreState({ phase, clip, previous }) {
  if (clip || phase === 'holding') return 'tool';
  return previous && previous !== 'screen' && WRIST_POSES.includes(previous) ? previous : 'down';
}
