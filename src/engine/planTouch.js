/**
 * OrbitControls touch configuration for Plan mode: one finger pans, two fingers
 * pan and pinch-zoom. Rotation stays off: the map is north-up (#135, #213).
 * The caller passes three.js TOUCH so this module stays testable without it.
 *
 * In three.js `THREE.TOUCH`, ROTATE is 0, PAN is 1 and DOLLY_PAN is 2. Plan maps
 * only ONE and TWO, so a finger can never rotate the map: the caller keeps
 * `controls.enableRotate = false` and never assigns TOUCH.ROTATE here.
 */

/**
 * Build the `controls.touches` object for Plan mode. Every call returns a fresh
 * object holding copies of the two enum numbers, so a later change to the input
 * (or to OrbitControls defaults) cannot reach it through a shared reference.
 *
 * @param {{ ROTATE: number, PAN: number, DOLLY_PAN: number }} TOUCH three.js TOUCH enum
 * @returns {{ ONE: number, TWO: number }} ONE pans; TWO pans and pinch-zooms
 */
export function planTouches(TOUCH) {
  return { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
}
