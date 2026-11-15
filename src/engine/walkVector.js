/**
 * Walk speed from the keyboard plus the analogue sources (touch stick and gamepad, #103).
 *
 * The keyboard keeps the mapping the engine had before touch and gamepad existed: each pressed key
 * contributes one full `keySpeed` on its axis, so a diagonal press is not normalised. Touch and gamepad
 * add a vector of magnitude 0..1 multiplied by `anaSpeed` (the walk or jog speed). While any analogue
 * source is active the sum is capped at `maxSpeed`, so mixing sources can never outrun Shift on the
 * keyboard and the suit model's validated range stays intact.
 *
 * Plain JavaScript, no DOM and no three.js, so the invariant is unit-tested.
 */

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * @param {{
 *   keyX?: number, keyY?: number, keySpeed?: number,
 *   anaX?: number, anaY?: number, anaSpeed?: number,
 *   maxSpeed?: number,
 * }} [input] keyX/keyY in -1..1 (right/forward), anaX/anaY a vector of magnitude <= 1 (right/forward),
 *   speeds in m/s
 * @returns {{ x: number, y: number }} planar velocity in m/s: x east of the facing direction, y forward
 */
export function walkVector({
  keyX = 0,
  keyY = 0,
  keySpeed = 0,
  anaX = 0,
  anaY = 0,
  anaSpeed = 0,
  maxSpeed = 0,
} = {}) {
  const ax = finite(anaX), ay = finite(anaY);
  const analogueMagnitude = Math.hypot(ax, ay);
  const analogueScale = analogueMagnitude > 1 ? 1 / analogueMagnitude : 1;   // two sources can add up past 1
  const speed = finite(anaSpeed);
  let x = finite(keyX) * finite(keySpeed) + ax * analogueScale * speed;
  let y = finite(keyY) * finite(keySpeed) + ay * analogueScale * speed;
  const cap = finite(maxSpeed);
  if (analogueMagnitude > 0 && cap > 0) {
    const total = Math.hypot(x, y);
    if (total > cap) { x = x * cap / total; y = y * cap / total; }
  }
  return { x, y };
}
