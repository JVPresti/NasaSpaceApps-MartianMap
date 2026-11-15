// Text of EV2's radio line (#288), shared by the HUD component and its tests.
import { t } from '../i18n/index.js';

/** How long a callout stays on the visor, in ms. */
export const RADIO_SHOW_MS = 8000;

/** The callout's text in the current language. Parameters that are i18n keys ('crewmate.side.left') are translated too. */
export function calloutText(callout) {
  if (!callout || typeof callout.key !== 'string') return '';
  const params = {};
  for (const [k, v] of Object.entries(callout.params ?? {})) params[k] = typeof v === 'string' && v.startsWith('crewmate.') ? t(v) : v;
  return t(callout.key, params);
}
