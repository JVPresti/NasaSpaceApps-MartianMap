// Text of the route review in the debrief (#274): the summary line, one reason and one cost line per deviation, and
// the rules under "How to read these numbers". Pure functions over the result of src/sim/routeReview.js; the strings
// are in src/i18n under review.*. The thresholds come from REVIEW_RULES, the constants the review itself uses.
import { t, translateText } from '../i18n/index.js';
import { REVIEW_RULES, VERDICTS } from '../sim/routeReview.js';
import {
  formatDistance,
  formatMinutes,
  formatMissionTime,
  formatSignedDelta,
  formatSignedGrams,
  formatSignedMetres,
  waypointCode,
} from './format.js';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const plural = (key, n, values = {}) => t(key + (n === 1 ? '.one' : '.many'), { n, ...values });

/** 'Worth it', 'Forced', 'Risky' or 'Costly'. */
export const verdictLabel = (verdict) => t('review.verdict.' + verdict);

/**
 * The one line at the top of the review: "2 deviations: 1 worth it, 1 risky. +7 min and +41 g O2 over the plan."
 * @param {ReturnType<typeof import('../sim/routeReview.js').reviewRoute>} review
 */
export function summaryLine(review) {
  if (!review.ok) return t('review.summary.no.plan');
  const n = review.deviations.length;
  if (n === 0) return t('review.summary.none');
  const counts = VERDICTS.filter((v) => review.counts[v] > 0).map((v) => plural('review.count.' + v, review.counts[v])).join(', ');
  const head = n === 1 ? t('review.summary.one', { counts }) : t('review.summary.many', { n, counts });
  const { extraSec, extraO2G } = review.totals;
  if (!isNumber(extraSec) || !isNumber(extraO2G)) return head;
  return head + ' ' + t('review.summary.extra', { time: formatSignedDelta(extraSec), o2: formatSignedGrams(extraO2G) });
}

/** The label of an event id, from the EVA's own event history, in the interface language. */
export function eventLabel(eventId, events) {
  const entry = Array.isArray(events) ? events.find((e) => e?.eventId === eventId && typeof e.label === 'string') : null;
  return translateText(entry?.label ?? eventId ?? '');
}

const nearText = (near) => (near && typeof near.name === 'string' ? waypointCode(near.name, near.index) : t('review.near.route'));

/**
 * The reason of a verdict in one line, such as "Crossed 23° near WP2 with 12 min of margin".
 * @param {{ reason: object }} deviation
 * @param {Array<object>} [events] summary.events, for the alert names
 */
export function reasonText(deviation, events = []) {
  const r = deviation.reason ?? {};
  const margin = formatMinutes(r.marginSec);
  switch (r.code) {
    case 'slope':
      return isNumber(r.marginSec)
        ? t('review.reason.slope', { deg: Math.round(r.slopeDeg), near: nearText(r.near), margin })
        : t('review.reason.slope.short', { deg: Math.round(r.slopeDeg), near: nearText(r.near) });
    case 'event': return t('review.reason.event', { event: eventLabel(r.eventId, events) });
    case 'replan': return t(r.kind === 'event' ? 'review.reason.replan.event' : 'review.reason.replan.slope', { time: formatMissionTime(r.atSec) });
    case 'reserve': return t('review.reason.reserve', { margin, near: nearText(r.near) });
    case 'late-event': return t('review.reason.late.event', { event: eventLabel(r.eventId, events) });
    case 'find': return t('review.reason.find', { label: r.label ?? '', margin });
    case 'sample': return plural('review.reason.sample', r.count, { margin });
    default: return t('review.reason.none', { distance: formatDistance(deviation.cost?.walkedM) });
  }
}

/** "+3 min · +18 g O2 · +56 m over the plan". */
export function costText(cost) {
  return t('review.cost', { time: formatSignedDelta(cost?.extraSec), o2: formatSignedGrams(cost?.extraO2G), distance: formatSignedMetres(cost?.extraM) });
}

/** "Lowest margin 12 min · steepest 23°". */
export function detailText(cost) {
  return t('review.detail', { margin: formatMinutes(cost?.minMarginSec), deg: isNumber(cost?.maxSlopeDeg) ? Math.round(cost.maxSlopeDeg) : '—' });
}

/**
 * The review rules for "How to read these numbers", from the same constants the review uses.
 * @param {number | null} reserveSec the suit reserve (suitConstantsFromHazards(hazards).reserveSec), null until loaded
 * @returns {Array<{ term: string | null, text: string }>}
 */
export function ruleNotes(reserveSec = null, rules = REVIEW_RULES) {
  const reserve = isNumber(reserveSec) ? Math.round(reserveSec / 60) : null;
  return [
    { term: null, text: t('review.notes.deviation', { enter: rules.enterM, length: rules.minLengthM, exit: rules.exitM }) },
    { term: null, text: t('review.notes.cost') },
    { term: verdictLabel('worth'), text: t('review.notes.worth') },
    { term: verdictLabel('forced'), text: t('review.notes.forced') },
    { term: verdictLabel('risky'), text: reserve === null ? t('review.notes.risky.short', { slope: rules.slopeLimitDeg }) : t('review.notes.risky', { slope: rules.slopeLimitDeg, reserve }) },
    { term: verdictLabel('costly'), text: t('review.notes.costly') },
    // The order judge() in src/sim/routeReview.js applies, accepted by the product owner as built.
    { term: t('review.notes.order.term'), text: t('review.notes.order', { slope: rules.slopeLimitDeg }) },
  ];
}
