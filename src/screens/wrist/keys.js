// Event.code keeps the bindings independent of the keyboard layout. The codes come from the action list (#365).
import { action, codeOf } from '../../input/actions.js';

const WRIST_CODES = new Map([
  ['wrist-previous-page', 'previous-page'], ['wrist-next-page', 'next-page'],
  ['wrist-next-row', 'next-row'], ['wrist-previous-row', 'previous-row'], ['wrist-confirm', 'confirm'],
].flatMap(([id, name]) => action(id).codes.map((code) => [code, name])));
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
  if (event.code === codeOf('wrist')) return !open && qHeld ? null : 'toggle';
  if (!open) return null;
  return WRIST_CODES.get(event.code) ?? null;
}
