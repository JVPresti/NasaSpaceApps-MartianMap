// What the habitat seat's map draws (#55): the crew from `habitat.crew` (src/net/habitat.js writes it from the radio),
// the route the crew has, and the room's markers. Plain JavaScript, no React, so the rules are tested on their own.
import { PLAYER_COLORS } from '../engine/crew.js';
import { t } from '../i18n/index.js';
import { crewCss } from '../hud/crewColor.js';
import { toMap } from '../plan/mapLayers.js';

/** The habitat seat's step at the mission table, before Site. A function, so the label follows the language. */
export const HABITAT_TAB = () => ({ id: 'crew', label: t('online.habitat.tab') });

/** Grey for a suit the radio cannot reach: the map shows where it was, not where it is. */
export const LAST_KNOWN_COLOR = '#8b939c';
const INSIDE = (u, v) => u >= -2 && u <= 102 && v >= -2 && v <= 102;

/** A crew member's suit colour as CSS, or the neutral grey. */
export const suitCss = (color) => (Number.isInteger(color) && crewCss(PLAYER_COLORS[color])) || '#d9d2c8';

/**
 * Crew marks in map percent. Out-of-sight entries are grey and flagged lastKnown; entries outside the crop are left out.
 * @param {Array<{ id, name, color, x, z, link, lastKnown }>} crew @param {{ x0, z0, size }} crop
 */
export function crewMarks(crew, crop) {
  const out = [];
  for (const c of crew || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.z)) continue;
    const [u, v] = toMap(c.x, c.z, crop);
    if (!INSIDE(u, v)) continue;
    out.push({ id: c.id, name: c.name, u, v, lastKnown: !!c.lastKnown, color: c.lastKnown ? LAST_KNOWN_COLOR : suitCss(c.color) });
  }
  return out;
}

/** The SVG points of a path in metres, for a polyline in the map's 0-100 viewBox. */
export function polylinePoints(path, crop) {
  if (!Array.isArray(path) || path.length < 2) return '';
  return path.map(([x, z]) => toMap(x, z, crop).map((n) => n.toFixed(2)).join(',')).join(' ');
}

/** "40 s" or "3 min" for an age in ms, through the caller's translator. */
export function ageText(ms, t) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? t('online.habitat.seconds', { n: sec }) : t('online.habitat.minutes', { n: Math.floor(sec / 60) });
}
