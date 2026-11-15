// Event.code keeps the bindings independent of the keyboard layout.
/**
 * @param {KeyboardEvent} event
 * @param {boolean} open the wrist is up
 * @param {{ qHeld?: boolean }} [options] R must not raise the wrist in the middle of the Q find gesture (#231);
 *   closing it is always allowed.
 * @returns {string | null}
 */
export function wristKey(event, open, { qHeld = false } = {}) {
  const el = event.target;
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey
    || event.isComposing || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return null;
  if (event.code === 'KeyR') return !open && qHeld ? null : 'toggle';
  if (!open) return null;
  return { BracketLeft: 'previous-page', BracketRight: 'next-page', KeyJ: 'next-row', KeyK: 'previous-row', Enter: 'confirm' }[event.code] ?? null;
}
