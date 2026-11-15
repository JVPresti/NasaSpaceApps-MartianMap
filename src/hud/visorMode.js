// The visor's mode (#283, #286): which key toggles every instrument, when the sampling checklist joins the default set,
// and the classes that hud.css reads. Plain functions, so the rules are tested without a DOM.
import { codeOf } from '../input/actions.js';

export const DETAIL_CODE = codeOf('visor-detail');

/**
 * Whether a keydown toggles every instrument: I, no repeat or modifier, not while typing, not while the wrist screen owns
 * the keys (#231), not behind an open dialog.
 */
export function isDetailToggle(e, { wristOwnsKeys = false, dialogOpen = false } = {}) {
  if (!e || e.code !== DETAIL_CODE || e.repeat || e.ctrlKey || e.metaKey || e.altKey || wristOwnsKeys || dialogOpen) return false;
  const el = e.target;
  return !(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

/** The checklist shows by default while a rock or the soil is in view or a sample is under way. */
export function samplingInProgress(state) {
  const sp = state && state.sampling;
  if (!sp) return false;
  const c = sp.checklist || {};
  return !!(sp.status && sp.status.target) || !!c.photo || !!c.texture || !!c.sample;
}

/** Write the mode classes on the .hud element's classList. */
export function applyVisorClasses(classList, { detail, sampling }) {
  classList.toggle('hud-detail', !!detail);
  classList.toggle('hud-sampling-on', !!sampling);
}
