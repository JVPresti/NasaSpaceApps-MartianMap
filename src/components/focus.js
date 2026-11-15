/**
 * Focus rules shared by the modals. Plain DOM objects in, no React.
 *
 * A menu must always leave one usable control focused. A disabled control cannot take focus (the
 * pause dialog disables Resume while the browser answers a pointer-lock request), and an inert one
 * must stay out of the tab order. When the marked primary cannot be focused, focus is lost to the
 * <dialog> itself and Enter does nothing, even while the menu tells the player to press Enter.
 */

/** Every element the modal may focus, in document order. Disabled controls are added by their owner. */
export const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A control can take focus only when it is enabled, rendered and outside an inert subtree. */
export function isUsableControl(element) {
  if (!element || element.disabled) return false;
  if (element.closest?.('[inert]')) return false;
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
  return true;
}

/**
 * The control a dialog should focus: the marked primary when it can take focus, otherwise the first
 * usable control, so the dialog always has an active button for Enter and Space.
 * @param {object | null} primary
 * @param {Array<object>} controls
 * @returns {object | null}
 */
export function focusTarget(primary, controls = []) {
  if (isUsableControl(primary)) return primary;
  return controls.find(isUsableControl) || null;
}
