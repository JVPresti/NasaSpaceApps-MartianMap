// Title tooltips on a touch screen (#365). A mouse shows an element's title on hover; a finger never hovers, so the
// text behind a title (a row's meaning, a map place's name, a layer's description) would be out of reach. TapTitles
// shows it instead: a tap on a plain element with a title, or a long press on a control with one (a tap there keeps
// doing what the control does). Plain JavaScript, so the choice is tested without a browser.

/** A press held this long, without moving more than LONG_PRESS_SLOP_PX, shows the title. Milliseconds. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 10;
/** The bubble closes on its own after this long. Milliseconds. */
export const TITLE_SHOW_MS = 6000;

const CONTROL = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="tab"], [tabindex]';

/**
 * The element whose title a touch should show, with its text, or null.
 * @param {Element | null} target where the finger landed
 * @param {'tap' | 'press'} kind a short tap, or a long press
 * @returns {{ el: Element, text: string } | null}
 */
export function titleTarget(target, kind) {
  const el = target?.closest?.('[title]');
  if (!el) return null;
  const text = (el.getAttribute('title') ?? '').trim();
  if (!text) return null;
  // A tap on a control (or inside one) belongs to the control; its title waits for a long press.
  if (kind === 'tap' && target.closest(CONTROL)) return null;
  return { el, text };
}

/**
 * Where the bubble goes: under the element, or over it when the element sits in the lower 40 % of the screen.
 * @param {{ left: number, top: number, bottom: number }} rect the element's box in viewport pixels
 * @param {{ width: number, height: number }} view the viewport
 * @param {number} [width] the bubble's width
 */
export function placeTitle(rect, view, width = 280) {
  const margin = 8;
  const w = Math.min(width, view.width - 2 * margin);
  const left = Math.max(margin, Math.min(rect.left, view.width - w - margin));
  return rect.bottom < view.height * 0.6
    ? { left, top: rect.bottom + 6, maxWidth: w }
    : { left, bottom: view.height - rect.top + 6, maxWidth: w };
}
