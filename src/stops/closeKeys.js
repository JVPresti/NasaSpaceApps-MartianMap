/**
 * Which key presses close a science stop card. Esc only reaches the page while the mouse is free; Enter works while
 * walking with the mouse locked. Plain JavaScript, so the rules have tests without a DOM.
 *
 * `blocked` is true while the wrist screen owns the keyboard (#231): the card then keeps its state but does not
 * consume Enter or Esc.
 */
const CLOSE_CODES = new Set(['Enter', 'NumpadEnter', 'Escape']);

/** Fields own both keys: Enter commits a coordinate, Esc resets it. */
const FIELDS = 'input, textarea, select';
/** Enter on a focused control activates that control. Closing too would undo a waypoint button's own toggle. */
const CONTROLS = 'button, a[href], [role="button"], [tabindex]';
/** Esc on a focused source tag closes its details, not the card. */
const OWN_ESCAPE = '.source-tag-interactive';

/**
 * @param {{ code: string, defaultPrevented?: boolean, target?: { closest?: (selector: string) => unknown } | null }} event
 * @param {{ blocked?: boolean }} [options]
 */
export function isCloseKey(event, { blocked = false } = {}) {
  if (blocked || !CLOSE_CODES.has(event.code) || event.defaultPrevented) return false;
  const inside = (selector) => typeof event.target?.closest === 'function' && !!event.target.closest(selector);
  if (inside(FIELDS)) return false;
  if (event.code === 'Escape') return !inside(OWN_ESCAPE);
  return !inside(CONTROLS);
}
