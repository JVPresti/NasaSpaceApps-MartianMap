import { t, formatNumber, formatUnit, translateText } from '../i18n/index.js';
// Pure helpers for the helmet HUD: formatting and the few derived values it shows. No React, no three.js.
// Coordinates: x east, z south, metres from Cheyava Falls. Bearings and headings are degrees clockwise from north.
import { bearingDeg, wrapDeg } from '../sim/bearing.js';
import { nextTarget } from '../sim/waypointRunner.js';

export { bearingDeg, wrapDeg };

/** Suited walking speed for the ETA, public/data/hazards.json mobility.speed.flat (SIM), the same as Walk mode. */
export const ETA_SPEED_MS = 1.0;

const dash = '–';
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * 'h:mm:ss' for an elapsed time in seconds, '–:––:––' when unknown: the EVA clock of the visor pill and the mission table's
 * header. The seconds show it running (a first mission lasts minutes and its events are timed in seconds), and it is the
 * debrief's format without the 'T+' (src/debrief/format.js formatMissionTime).
 */
export function formatEva(sec) {
  if (!num(sec) || sec < 0) return dash + ':' + dash + dash + ':' + dash + dash;
  const s = Math.floor(sec), pad = (n) => String(n).padStart(2, '0');
  return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
}

/** Rounded value as text, or a dash when the value is not known yet (the store uses null for that). */
export function formatValue(v, digits = 0) {
  return num(v) ? formatNumber(v, digits) : dash;
}

/** The EVA's dose in µGy: one decimal under 10 µGy, so a short EVA does not read 0 while the dose grows; whole above. */
export function formatDose(ugy) {
  return formatValue(ugy, num(ugy) && Math.abs(ugy) < 10 ? 1 : 0);
}
/** Whole minutes from seconds, rounded, with a sign when asked: '+41', '-3'. */
export function formatMinutes(sec, { signed = false } = {}) {
  if (!num(sec)) return dash;
  const m = Math.round(sec / 60);
  return signed && m > 0 ? '+' + m : String(m);
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** The nearest of the eight compass points. */
export function cardinal(deg) {
  return translateText(CARDINALS[Math.round(wrapDeg(deg) / 45) % 8]);
}

/**
 * Range, bearing and ETA to the current target: the event shelter while one is set, else the next waypoint that is
 * neither visited nor skipped (`nextTarget` in src/sim/waypointRunner.js, the same choice the runner makes).
 * Null without a position, without a route, or once the route is complete.
 */
export function nextWaypointInfo(route, nav) {
  const t = nextTarget(route);
  if (!t || t.kind === 'complete' || !nav || !num(nav.x) || !num(nav.z)) return null;
  const rangeM = Math.hypot(t.x - nav.x, t.z - nav.z);
  const name = t.name || 'WP' + (t.index + 1);
  return {
    kind: t.kind, name, shortName: t.kind === 'shelter' ? shortName(name, 0) : shortName(t.name, t.index),
    x: t.x, z: t.z, rangeM, bearingDeg: bearingDeg(nav, t), etaSec: rangeM / ETA_SPEED_MS,
  };
}

/** 'WP2 · dune field edge' -> 'WP2'; a name without a code stays as it is. */
export function shortName(name, i = 0) {
  if (!name) return 'WP' + (i + 1);
  const code = name.split('·')[0].trim();
  return code || name;
}

const LEVEL_RANK = { info: 0, caution: 1, warning: 2, danger: 2 };
/**
 * The alert to show in the banner: the most severe active one, the newest first on a tie.
 * The banner has three levels: info, caution and warning (the event engine's 'danger' shows as warning).
 */
export function pickAlert(alerts) {
  let best = null;
  for (const a of Object.values(alerts || {})) {
    if (!a || a.active === false) continue;
    const r = LEVEL_RANK[a.level] ?? 0;
    if (!best || r > best.rank || (r === best.rank && (a.startedAtSec ?? 0) > (best.alert.startedAtSec ?? 0))) best = { rank: r, alert: a };
  }
  if (!best) return null;
  return { ...best.alert, level: best.rank === 2 ? 'warning' : best.rank === 1 ? 'caution' : 'info' };
}

/** 'nominal' | 'caution' | 'warning' for a suit value: the suit model's status drives O2 and walkback, low battery its own. */
export function batteryLevel(pct) {
  if (!num(pct)) return 'nominal';
  return pct <= 10 ? 'warning' : pct <= 25 ? 'caution' : 'nominal';
}

// Navigation line (#21). Mars has no navigation satellites, so the HUD says how the position was estimated, how far off
// it may be and how old the last fix is. Section 4.2 of docs/IMPLEMENTATION_PLAN.md.

/** Position error in metres above which the visor asks for a stop and a terrain fix (SIM, our rule): 250 to 500 m of dead reckoning at 1 to 2 % drift. */
export const NAV_FIX_LIMIT_M = 5;

/** '±0.4 m' under 10 m, '±12 m' from 10 m, '±– m' when unknown. */
export function formatNavError(m) {
  if (!num(m) || m < 0) return '±' + dash + ' m';
  return '±' + formatUnit(m < 9.95 ? m : Math.round(m), 'm', m < 9.95 ? 1 : 0);
}

/** Age of the last fix in mission time: 'just now', '3 min ago', '1 h 05 min ago'; 'no fix yet' without one. */
export function formatFixAge(lastFixSec, nowSec) {
  if (!num(lastFixSec)) return t('ui.no.fix.yet');
  if (!num(nowSec)) return dash;
  const m = Math.floor(Math.max(0, nowSec - lastFixSec) / 60);
  if (m < 1) return t('ui.just.now');
  return m < 60 ? t('fixAgeMinutes', { minutes: formatNumber(m) }) : t('fixAgeHours', { hours: formatNumber(Math.floor(m / 60)), minutes: String(m % 60).padStart(2, '0') });
}

/** 'NAV · terrain fix · ±0.4 m · 3 min ago' from the navigation slice and the mission time (mission.elapsedSec). */
export function formatNavLine(nav, nowSec) {
  if (!nav || !num(nav.errorM)) return t('ui.nav.no.position.estimate');
  return [t('ui.nav'), translateText(nav.fixMode) || dash, formatNavError(nav.errorM), formatFixAge(nav.lastFixSec, nowSec)].join(' · ');
}

/** True once the error passes the limit: the visor then asks for a terrain fix. */
export function needsFix(errorM, limitM = NAV_FIX_LIMIT_M) {
  return num(errorM) && errorM > limitM;
}

/** The prompt under the navigation line, or null while the error is within the limit. */
export function navFixPrompt(errorM, limitM = NAV_FIX_LIMIT_M) {
  return needsFix(errorM, limitM) ? t('ui.stop.for.a.terrain.fix.stand.still.and') : null;
}
