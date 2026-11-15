/**
 * Partner status for the pair walk (plan section 3.4, scenario 7; issue #70): range and bearing to the partner and
 * the separation rule with its caution and warning levels.
 *
 * Plain JavaScript with no React and no three.js. Coordinates: x east, z south, metres from Cheyava Falls.
 * Bearings are degrees clockwise from north, and north is -z, as in src/hud/format.js.
 */

/**
 * Separation rule (SIM, our rule). public/data/hazards.json has no buddy or separation value, so the limit is the
 * 100 m of the pair-walk mockup ("Escenario 7 · Caminata en pareja"). Caution starts at 80 % of the limit.
 * hysteresisM is how far back inside a threshold the range must come before the level drops, so a partner walking
 * along the line does not flicker the alert.
 */
export const SEPARATION_RULE = Object.freeze({ limitM: 100, cautionM: 80, hysteresisM: 5 });

export const SEPARATION_ALERT_ID = 'partner-separation';

const wrapDeg = (d) => ((d % 360) + 360) % 360;

/** Range in metres and bearing in degrees clockwise from north, from a to b. */
export function rangeBearing(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return { rangeM: Math.hypot(dx, dz), bearingDeg: wrapDeg(Math.atan2(dx, -dz) * 180 / Math.PI) };
}

/**
 * 'nominal' | 'caution' | 'warning' for a range, given the previous level.
 * Rises at cautionM and past limitM; falls only once the range is hysteresisM back inside the threshold.
 */
export function separationLevel(rangeM, prev = 'nominal', rule = SEPARATION_RULE) {
  if (!Number.isFinite(rangeM)) return prev;
  const { limitM, cautionM, hysteresisM } = rule;
  if (rangeM > limitM) return 'warning';
  if (prev === 'warning' && rangeM > limitM - hysteresisM) return 'warning';
  if (rangeM >= cautionM) return 'caution';
  if (prev !== 'nominal' && rangeM > cautionM - hysteresisM) return 'caution';
  return 'nominal';
}

/**
 * The alert for a separation level, in the shape of the store's alerts map (docs/STATE_AND_ENGINE.md), or null for
 * 'nominal'. The event banner (src/events/EventBanner.jsx) shows it like an event alert.
 */
export function separationAlert(level, { partnerId = 'EV2', startedAtSec = 0, rule = SEPARATION_RULE } = {}) {
  if (level !== 'caution' && level !== 'warning') return null;
  const text = level === 'warning'
    ? `${partnerId} is past the ${rule.limitM} m separation limit: walk back toward your partner`
    : `${partnerId} is close to the ${rule.limitM} m separation limit`;
  return { id: SEPARATION_ALERT_ID, eventId: SEPARATION_ALERT_ID, level, text, startedAtSec, active: true };
}
