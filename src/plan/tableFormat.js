import { t } from '../i18n/index.js';

// Durations as the mission table words them. Plain functions over t(), so they are tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * A duration in words, sign dropped: whole seconds under 90 s, then whole minutes, then hours and minutes.
 * @param {number | null | undefined} sec
 * @param {{ secondsBelow?: number }} [options] secondsBelow: whole seconds under this many (an event time under two
 *   minutes reads in seconds, as the Hazards step prints it)
 * @returns {string} an en dash when unknown
 */
export function shortDuration(sec, { secondsBelow = 90 } = {}) {
  if (!finite(sec)) return '–';
  const s = Math.abs(sec);
  if (s < secondsBelow) return t('table.duration.sec', { sec: Math.round(s) });
  const minutes = Math.round(s / 60);
  if (minutes < 60) return t('ui.p0.min', { p0: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t('ui.p0.h.p1.min', { p0: hours, p1: rest }) : `${hours} h`;
}

/**
 * When an event starts, for the Hazards step: seconds under two minutes (the first sortie's events come at tens of
 * seconds), whole minutes after that.
 * @param {number | null | undefined} sec mission time
 * @returns {string | null} null when the mission does not schedule the event
 */
export function eventWhen(sec) {
  if (!finite(sec)) return null;
  if (sec < 120) return t('table.hazard.when.sec', { sec: Math.round(sec) });
  return t('table.hazard.when.min', { min: Math.round(sec / 60) });
}
