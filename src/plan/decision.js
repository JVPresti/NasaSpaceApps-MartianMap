import { formatNumber, t, translateText } from '../i18n/index.js';
import { formatLmst } from '../sim/missionClock.js';
import { shortDuration } from './tableFormat.js';

// Go / no-go at the mission table, one decision for the whole plan (P1): it names the tightest of the limits, time,
// oxygen, battery and daylight (#324), with its figure. A no-go says which limit breaks, by how much, and the way out
// when there is one (P10). The dust opacity above the terrain-fix limit is also a no-go (#248). Plain function over
// t(), so it is tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const LIMITS = ['time', 'o2', 'battery', 'daylight'];
const sunsetOf = (hours) => formatLmst(hours * 3600);

/**
 * The way out of a no-go: the least time, O2 or battery that lets the plan through, else an earlier egress or a
 * shorter goal. For "Collect samples" the shorter goal is a nearer first task (#352): the plan keeps a later task only
 * when it fits, so a no-go means the first task alone does not.
 */
function wayOut(limit, objective) {
  let way;
  if (limit.id === 'time' && finite(limit.needMin)) way = t('table.way.time', { time: shortDuration(limit.needMin * 60) });
  else if (limit.id === 'o2' && finite(limit.needPct)) way = t('table.way.o2', { pct: limit.needPct });
  else if (limit.id === 'battery' && finite(limit.needPct)) way = t('table.way.battery', { pct: limit.needPct });
  // daylight: leave early enough for this plan, or cut the plan to the daylight there is at this egress
  else if (limit.id === 'daylight') way = t('table.way.daylight', { latest: sunsetOf(limit.sunsetHours - limit.planSec / 3600), light: shortDuration(Math.max(0, limit.toSunsetSec)) });
  else if (objective === 'samples') return t('tasktable.way.task');
  else if (objective !== 'sortie') return t('table.way.first');
  else return t('table.way.none');
  if (objective === 'samples') return t('tasktable.way.or.task', { way });
  return objective && objective !== 'sortie' ? t('table.way.or.sortie', { way }) : t('table.way.end', { way });
}

/** What breaks: the limit, by how much. */
function breaks(limit) {
  if (limit.id === 'time') {
    return t('table.decision.no.time', {
      used: shortDuration(limit.usedSec), usable: shortDuration(limit.usableSec), available: shortDuration(limit.availableSec), reserve: limit.reservePct,
    });
  }
  if (limit.id === 'o2') {
    if (limit.marginSec <= 0 || limit.floorSec <= 0) return t('table.decision.no.o2.reserve', { short: shortDuration(Math.max(0, -limit.marginSec)) });
    return t('table.decision.no.o2.floor', { margin: shortDuration(limit.marginSec), floor: shortDuration(limit.floorSec) });
  }
  if (limit.id === 'daylight') {
    const sunset = sunsetOf(limit.sunsetHours), egress = sunsetOf(limit.egressHours);
    // the egress itself is after sunset: there is no daylight to spend (#294 would make the demo read this way)
    if (!(limit.toSunsetSec > 0)) return t('table.decision.no.daylight.dark', { sunset, egress });
    return t('table.decision.no.daylight', {
      sunset, egress, light: shortDuration(limit.toSunsetSec), plan: shortDuration(limit.planSec), over: shortDuration(-limit.spareSec),
    });
  }
  if (finite(limit.arrivalPct) && limit.arrivalPct < 0) {
    return t('table.decision.no.battery.out', { short: formatNumber(-limit.arrivalPct, 0), reserve: limit.reservePct });
  }
  return t('table.decision.no.battery', { left: formatNumber(limit.arrivalPct, 0), reserve: limit.reservePct });
}

/** The tightest limit and its slack, for a go. */
export function tightestText(limit) {
  return t(`table.decision.tight.${limit.id}`, { spare: shortDuration(limit.spareSec) });
}

/**
 * @param {{ planner: { status: string, error?: string | null }, totals: object | null,
 *   limits?: ReturnType<typeof import('./limits.js').planLimits> | null, dust?: { tau: number, limit: number } | null,
 *   objective?: string | null, radiationExpected?: boolean, noTasks?: boolean }} input
 *   limits: planLimits() of the route on the table; dust: the opacity the crew would walk in and the terrain-fix
 *   limit (hazards.json dust.event.nav_fix_tau_max); objective: the crew's goal, for the way out; radiationExpected: the
 *   run's radiation alert is switched on and has not fired (the outlook beside the decision gives its time); noTasks: the
 *   goal is "Collect samples" and the list is empty (#352), so the no-go says to add a task instead of "No route found"
 * @returns {{ tone: 'ok' | 'caution' | 'warning' | null, title: string, text: string, note?: string, go: boolean,
 *   reason: 'no-tasks' | 'error' | 'planning' | 'time' | 'o2' | 'battery' | 'daylight' | 'reserve' | 'dust' | 'caution' | 'go', limit: string | null }}
 */
export function decisionFor({ planner, totals, limits = null, dust = null, objective = null, radiationExpected = false, noTasks = false }) {
  const noGo = (reason, text, limit = null) => ({ tone: 'warning', title: t('table.decision.no.go'), text, go: false, reason, limit });
  if (noTasks) return noGo('no-tasks', t('tasks.plan.none'));
  if (planner?.status === 'error') return noGo('error', planner.error ? translateText(planner.error) : t('table.decision.no.route'));
  if (!totals) return { tone: null, title: t('table.decision.planning'), text: t('table.decision.waiting'), go: false, reason: 'planning', limit: null };
  if (limits?.failing) {
    const limit = limits.failing;
    return noGo(limit.id, `${breaks(limit)} ${wayOut(limit, objective)}`, limit.id);
  }
  if (!limits && totals.status === 'warning') return noGo('reserve', t('table.decision.reserve'), 'o2');
  if (dust && finite(dust.tau) && finite(dust.limit) && dust.tau > dust.limit) {
    return noGo('dust', t('table.decision.dust', { tau: formatNumber(dust.tau, 1), limit: formatNumber(dust.limit, 1) }));
  }
  const tight = limits?.tightest && LIMITS.includes(limits.tightest.id) ? `${tightestText(limits.tightest)} ` : '';
  // D6: a forecast radiation alert does not stop a go; the crew is told to expect it and shelter early.
  const expect = radiationExpected ? `${t('table.decision.radiation.expected')} ` : '';
  const caution = limits ? limits.status === 'caution' : totals.status === 'caution';
  if (caution) {
    return { tone: 'caution', title: t('table.decision.go.with.care'), text: (tight + expect).trim(), note: t('table.decision.begin.note'), go: true, reason: 'caution', limit: limits?.tightest?.id ?? null };
  }
  return { tone: 'ok', title: t('table.decision.go'), text: (tight + expect).trim(), note: t('table.decision.begin.note'), go: true, reason: 'go', limit: limits?.tightest?.id ?? null };
}

/**
 * The suit's status before the EVA, against the plan: the O2 and battery at the start are the crew's inputs, so
 * "Nominal" only while both cover the plan with room to spare (P1).
 * @param {ReturnType<typeof import('./limits.js').planLimits> | null} limits
 * @param {{ cautionSec: number } | null} constants
 * @returns {{ label: string, tone: 'ok' | 'caution' | 'warning' }}
 */
export function startSuitStatus(limits, constants) {
  const suit = limits ? [limits.o2, limits.battery] : [];
  if (suit.some((limit) => !limit.ok)) return { label: t('table.suit.status.short'), tone: 'warning' };
  if (constants && suit.some((limit) => limit.spareSec < constants.cautionSec)) return { label: t('table.suit.status.low'), tone: 'caution' };
  return { label: t('table.nominal'), tone: 'ok' };
}

/**
 * The suit's live status during the EVA (suit.status, the suit model).
 * @param {'nominal' | 'caution' | 'warning' | null} status
 * @returns {{ label: string, tone: 'ok' | 'caution' | 'warning' }}
 */
export function liveSuitStatus(status) {
  if (status === 'warning') return { label: t('table.suit.status.warning'), tone: 'warning' };
  if (status === 'caution') return { label: t('table.suit.status.caution'), tone: 'caution' };
  return { label: t('table.nominal'), tone: 'ok' };
}
