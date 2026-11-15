import { formatUnit } from '../i18n/index.js';
// Shelter marker rules, kept free of three.js so they can be tested quickly (shelterHighlight.js, shelterLabel.js).

export const FULL_WITHIN_M = 80;     // full label ("SHELTER · 60 m") within this distance
export const HIDE_WITHIN_M = 15;     // no label closer than this: the shelter is in plain sight
export const LOOK_RADIUS = 0.22;     // "looking at it": within this distance of the screen centre, in normalised device coordinates

/** True for an object with finite x and z. @param {unknown} s */
export function validShelter(s) {
  return !!s && typeof s === 'object' && Number.isFinite(s.x) && Number.isFinite(s.z);
}

/** Distance as the label shows it: 5 m steps up to 1 km, then km with one decimal. */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 1000) return formatUnit(Math.max(0, Math.round(m / 5) * 5), 'm');
  return formatUnit(m / 1000, 'km', 1);
}

/** Which version of the label to show. @returns {'hidden' | 'compact' | 'full'} */
export function labelMode(distanceM, lookOffset) {
  if (!(distanceM >= HIDE_WITHIN_M)) return 'hidden';
  return distanceM < FULL_WITHIN_M || lookOffset < LOOK_RADIUS ? 'full' : 'compact';
}
