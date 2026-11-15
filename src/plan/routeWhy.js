import { formatNumber, t } from '../i18n/index.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { shortDuration } from './tableFormat.js';

// "Why this route" (#246) in words. The planner gives codes and numbers only (src/sim/routeExplain.js for each leg,
// route.planReasons and route.dropped from src/sim/missionNeeds.js); this module writes the sentences in the
// interface language. Plain functions, tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : '');

/** A detour shorter than this, in metres and seconds, is not worth a number. */
const NOTHING_M = 1;
const NOTHING_SEC = 5;

/**
 * What a leg's detour costs: the extra metres, then the extra walking time, or the climb it saves when going around
 * is quicker than straight over (extraSec below zero).
 * @param {{ extraM: number, extraSec: number | null }} entry
 */
function detourCost(entry) {
  const m = Math.round(entry.extraM);
  if (!finite(entry.extraSec) || Math.abs(entry.extraSec) < NOTHING_SEC) return m >= NOTHING_M ? t('why.cost.metres', { m }) : null;
  return t(entry.extraSec > 0 ? 'why.cost.more' : 'why.cost.saves', { m, time: shortDuration(entry.extraSec) });
}

/**
 * Why one leg runs where it does (route.explain entry): the straight line is clear, or what the route goes around and
 * what that costs. Lower case, to follow other text on the line.
 * @param {{ clear: boolean, block: null | 'slope' | 'steep' | 'rock' | 'radio' | 'traverse', extraM: number,
 *   extraSec: number | null } | null | undefined} entry
 * @returns {string | null}
 */
export function legWhy(entry) {
  if (!entry) return null;
  if (entry.clear) return t('why.leg.clear');
  const reason = t(`why.leg.${entry.block ?? 'steep'}`, { limit: COST_CONSTANTS.SLOPE_LIMIT_DEG });
  const cost = detourCost(entry);
  return cost ? t('why.leg.with.cost', { reason, cost }) : reason;
}

/**
 * The second line of a stop in the stop list: the work planned there (#247) and why the leg that reaches it runs where
 * it does (#246). Null when there is neither.
 * @param {{ workSec?: number | null, explain?: object | null }} stop
 * @returns {string | null}
 */
export function stopLine({ workSec = null, explain = null, role = null } = {}) {
  const parts = role ? [role] : [];
  if (finite(workSec) && workSec > 0) parts.push(t('why.work', { time: shortDuration(workSec) }));
  const why = legWhy(explain);
  if (why) parts.push(why);
  return parts.length ? sentence(parts.join(' · ')) : null;
}

/**
 * Why a stop the objective allows was left out (route.dropped entry).
 * @param {{ limit: 'time' | 'o2' | 'battery' | 'unreachable', overSec?: number | null, marginShortSec?: number | null,
 *   batteryShortWh?: number | null }} dropped
 * @returns {string}
 */
export function droppedWhy(dropped) {
  switch (dropped?.limit) {
    case 'time': return sentence(t('why.dropped.time', { over: shortDuration(dropped.overSec) }));
    case 'o2': return sentence(t('why.dropped.o2', { short: shortDuration(dropped.marginShortSec) }));
    case 'battery': return sentence(t('why.dropped.battery', { wh: Math.ceil(dropped.batteryShortWh ?? 0) }));
    default: return sentence(t('why.dropped.unreachable'));
  }
}

/**
 * A sampling task's what and how many (#352): "1 rock sample", "2 photos". Lower case, to follow other text.
 * @param {{ what: 'photo' | 'soil' | 'rock', count: number }} task
 * @returns {string}
 */
export function taskText(task) {
  const count = finite(task?.count) ? task.count : 1;
  return t(`tasks.what.${task?.what}.${count === 1 ? 'one' : 'many'}`, { count });
}

/**
 * The role of a task place in the stop line (stopLine's `role`), so the leg line names the tasks it serves: "for 1 rock
 * sample · 2 photos". Null without a task.
 * @param {Array<{ what: string, count: number }>} tasks the route.tasks entries kept at the place
 * @returns {string | null}
 */
export function taskRole(tasks) {
  const list = (Array.isArray(tasks) ? tasks : []).filter((task) => task && typeof task.what === 'string');
  return list.length ? t('tasks.role', { tasks: list.map(taskText).join(' · ') }) : null;
}

/**
 * Why a sampling task was left out of the plan (a route.tasks entry with its drop), as droppedWhy says it for a stop.
 * Null for a task that was not dropped.
 * @param {{ drop?: object | null }} task
 * @returns {string | null}
 */
export function taskDroppedWhy(task) {
  return task?.drop ? droppedWhy(task.drop) : null;
}

/**
 * The plan-level reasons as sentences, for the route panel: the crew rules, the risk setting and whether the plan fits
 * the crew's time, O2 and battery. Stops added or dropped are told in the stop list (stopLine, droppedWhy), sampling
 * tasks kept or dropped in the task list (taskRole, taskDroppedWhy).
 * @param {Array<{ code: string } & Record<string, unknown>>} reasons route.planReasons
 * @returns {string[]}
 */
export function planReasonLines(reasons) {
  const lines = [];
  for (const reason of Array.isArray(reasons) ? reasons : []) {
    switch (reason.code) {
      case 'solo-radio':
        lines.push(reason.requested && reason.requested !== 'radio'
          ? t('why.plan.solo.radio.chosen', { profile: t(`profiles.${reason.requested}`) })
          : t('why.plan.solo.radio'));
        break;
      case 'radio-unavailable':
        lines.push(t('why.plan.radio.unavailable', { profile: t(`profiles.${reason.profile}`) }));
        break;
      case 'solo-work':
        lines.push(t('why.plan.solo.work', { factor: formatNumber(reason.factor, 1) }));
        break;
      case 'risk':
        if (reason.risk === 'cautious' || reason.risk === 'bold') {
          lines.push(t(`why.plan.risk.${reason.risk}`, { reserve: Math.round(100 * (reason.reserveShare ?? 0)) }));
        }
        break;
      case 'fits':
        lines.push(t('why.plan.fits', { spare: shortDuration(Math.max(0, reason.spareSec ?? 0)) }));
        break;
      case 'required-over':
        if (reason.limit === 'time') lines.push(t('why.plan.over.time', { over: shortDuration(reason.overSec) }));
        else if (reason.limit === 'o2') lines.push(t('why.plan.over.o2', { short: shortDuration(reason.marginShortSec) }));
        else if (reason.limit === 'battery') lines.push(t('why.plan.over.battery', { wh: Math.ceil(reason.batteryShortWh ?? 0) }));
        break;
      case 'stop-missing':
        lines.push(t('why.plan.missing', { stop: reason.name ?? reason.stop }));
        break;
      case 'profile-unreachable':
        lines.push(t('why.plan.profile.unreachable', { profile: t(`profiles.${reason.profile}`) }));
        break;
      case 'profile-over':
        // the stops fit on the reference route, not on the profile the crew chose
        lines.push(t('why.plan.profile.over', {
          profile: t(`profiles.${reason.profile}`), reference: t(`profiles.${reason.reference}`), what: lowerFirst(droppedWhy(reason)),
        }));
        break;
      case 'no-stops':
        lines.push(t('why.plan.no.stops'));
        break;
      case 'no-tasks':
        lines.push(t('tasks.plan.none'));
        break;
      case 'unreachable':
        lines.push(t('why.plan.unreachable'));
        break;
      default:
        break;   // stop-added and stop-dropped: in the stop list; task-added and task-dropped: in the task list
    }
  }
  return lines;
}
