/**
 * The decisions of the route planner hook (useRoutePlanner.js), as plain functions so they can be tested without React
 * (round 1 review, N24): what to plan when the needs, the profile, the waypoints, the mast or Re-plan change, and a
 * queue that keeps one planner request in flight (N16).
 *
 * Plain JavaScript with no React and no three.js.
 */
import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenCaution from '../sim/events/low-oxygen-caution.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';
import { needsKey } from '../sim/missionNeeds.js';
import { tasksKey } from '../sim/sampleTasks.js';

/** The events that send the crew on a route of their own (a planner block): the storm, radiation, low O2 warning. */
const ROUTE_EVENTS = new Set([dustStorm, radiation, lowOxygenCaution, lowOxygenWarning].filter((event) => event.planner).map((event) => event.id));

/**
 * Whether an alert's route is the route, or about to be: route.shelter is set, or an event with a route is active (its
 * alert in the store; the shelter route may still be on its way from the planner). A waypoint plan then leaves
 * route.path alone (B1), and Re-plan brings no stop back (D12).
 * @param {{ shelter?: object | null } | null} route the store's route
 * @param {Record<string, { active?: boolean, id?: string, eventId?: string } | null> | null} alerts the store's alerts
 */
export function alertRouteActive(route, alerts) {
  if (route?.shelter) return true;
  return Object.values(alerts ?? {}).some((alert) => alert?.active === true && ROUTE_EVENTS.has(alert.eventId ?? alert.id));
}

/** The Re-plan count of a plan id (`${nonce}|${waypointKey}`), -1 for none. */
const planNonce = (planId) => (planId ? Number(String(planId).split('|')[0]) : -1);

/**
 * The route a waypoint plan writes, with the stops an event left out back in it when the plan answers Re-plan (D12):
 * once no alert route is active, Re-plan at the table clears route.skipped, so the remaining stops are the route again
 * and route.totals costs their work. route.visited and route.nextIndex stay (keepWalkProgress), so the next target is
 * the next stop not reached yet; a mission whose stops are all reached stays complete.
 * @param {object | null} route the planned route, the walk so far kept
 * @param {boolean} resume the plan answers Re-plan during the EVA
 */
export function resumeStops(route, resume) {
  return route && resume ? { ...route, skipped: [] } : route;
}

/**
 * The route a needs plan writes when it has no route in use: the plan's fields (its waypoints, stops, reasons, budget,
 * profiles, tasks), no path and no leg reasons, and why. For "Collect samples" (#352) the figures of the route before
 * it go too (distance, climb, steepest slope, time out), so an empty or unreachable task list reads blank, not the last
 * route's numbers (route.legs and route.totals follow route.path, legCosts.js). The three other goals keep them, as
 * before.
 * @param {object} route the store's route
 * @param {object} fields the plan's fields (useRoutePlanner needsJob)
 * @param {{ reason: string, objective?: string }} plan reason: why there is no route; objective: needs.objective
 * @returns {object}
 */
export function failedNeedsRoute(route, fields, { reason, objective }) {
  const failed = { ...route, ...fields, path: null, explain: [], reason };
  return objective === 'samples' ? { ...failed, distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null } : failed;
}

/**
 * What the hook remembers between renders.
 * - needsKey: the key of the needs plan on the table; plannedWaypointsKey: its waypoints
 * - lastKey, lastNonce, lastMast: the waypoints, Re-plan count and mast the waypoint planner last planned for
 * - appliedPlanId: `${nonce}|${waypointKey}` of the last waypoint plan written to route.path
 */
export function emptyPlannerMemory() {
  return { needsKey: '', plannedWaypointsKey: '', lastKey: '', lastNonce: -1, lastMast: '', appliedPlanId: '' };
}

/**
 * Key of a needs plan: the six needs, the sampling tasks of the "Collect samples" goal (#352, empty for the other goals),
 * the profile chosen at the table, Re-plan and the habitat mast. Any task edit plans again.
 */
export function needsPlanKey({ needs, profile, nonce, mastId }) {
  return `${needsKey(needs)}|${tasksKey(needs)}|${profile}|${nonce}|${mastId}`;
}

/**
 * Whether the route comes from the crew's needs: before the EVA (needs not locked) and with a site to choose from.
 * Once the EVA has begun the waypoints are planned as they stand (finds, Re-plan).
 * @param {{ locked?: boolean } | null} needs
 * @param {{ start?: object | null, stops?: Array<object> } | null} site
 */
export function plansFromNeeds(needs, site) {
  return !needs?.locked && Boolean(site?.start) && (site?.stops?.length ?? 0) > 0;
}

/**
 * Whether the route on the table is older than the needs (N15): a needs change is planned 120 ms later, and Begin EVA
 * must not lock the old route meanwhile.
 * @param {{ fromNeeds: boolean, key: string }} input key: needsPlanKey of the current needs
 * @param {{ needsKey: string }} memory
 */
export function needsPlanPending({ fromNeeds, key }, memory) {
  return fromNeeds && key !== memory.needsKey;
}

/**
 * What the hook does now, and its memory after the decision.
 *
 * Actions:
 * - 'none': nothing to plan
 * - 'restore-waypoints': this needs plan is on the table, but something else wrote route.waypoints (Plan mode loads
 *   route.json's anchors when it opens): put the planned stops back
 * - 'plan-needs': plan from the needs (key)
 * - 'plan-waypoints': plan the waypoints as they stand (planId); `resume` when it answers Re-plan (a new nonce since the
 *   plan on the table), which brings the stops an event left out back (resumeStops, D12)
 * - 'refresh-mast': only the mast arrived for a route already on the table: refresh the comparison, keep the route
 * - 'consume-find': a find accepted in Walk already re-planned these waypoints from the player (#71); planning again
 *   from the habitat would lose the walk so far, so take the route as it is and clear finds.routeKey
 *
 * While an event's shelter route is the route (`sheltered`, route.shelter set), a waypoint plan is dropped, not
 * deferred: it would replace the route home with the route out to the stops (round 2 review, B1). The mast refresh
 * and a find's route still go through; neither writes route.path.
 *
 * @param {{ enabled: boolean, ready: boolean, fromNeeds: boolean, needs: object, profile: string, nonce: number,
 *   mastId: string, waypointsKey: string, waypointCount: number, findsRouteKey?: string | null, sheltered?: boolean }} input
 * @param {ReturnType<typeof emptyPlannerMemory>} memory
 * @returns {{ action: string, key?: string, planId?: string, memory: object }}
 */
export function decidePlan(input, memory) {
  const { enabled, ready, fromNeeds, needs, profile, nonce, mastId, waypointsKey, waypointCount, findsRouteKey = null, sheltered = false } = input;
  if (!enabled || !ready) return { action: 'none', memory };

  if (fromNeeds) {
    const key = needsPlanKey({ needs, profile, nonce, mastId });
    if (key !== memory.needsKey) return { action: 'plan-needs', key, memory };
    const restore = memory.plannedWaypointsKey && waypointsKey !== memory.plannedWaypointsKey;
    return { action: restore ? 'restore-waypoints' : 'none', key, memory };
  }

  if (waypointCount < 2) return { action: 'none', memory };
  const planId = `${nonce}|${waypointsKey}`;
  const sameRoute = waypointsKey === memory.lastKey && nonce === memory.lastNonce;
  // A waypoint plan asked for while a shelter route is the route: taken as done, so it never replaces it later either.
  const dropped = (base) => ({ action: 'none', memory: { ...base, lastKey: waypointsKey, lastNonce: nonce, appliedPlanId: planId } });
  if (sameRoute && mastId === memory.lastMast) {
    // Planned already. A plan cancelled before it landed (the table closed for Walk meanwhile) is planned again.
    if (memory.appliedPlanId === planId) return { action: 'none', memory };
    return sheltered ? dropped(memory) : { action: 'plan-waypoints', planId, resume: nonce !== planNonce(memory.appliedPlanId), memory };
  }
  const next = { ...memory, lastMast: mastId };
  // The mast arrived (the habitat loads after the terrain) for the route already on the table. If the first plan was
  // still running it was cancelled, so plan in full.
  if (sameRoute && memory.appliedPlanId === planId) return { action: 'refresh-mast', planId, memory: next };
  if (nonce === memory.lastNonce && waypointsKey === findsRouteKey) {
    return { action: 'consume-find', planId, memory: { ...next, lastKey: waypointsKey, appliedPlanId: planId } };
  }
  if (sheltered) return dropped(next);
  return { action: 'plan-waypoints', planId, resume: nonce !== planNonce(memory.appliedPlanId), memory: { ...next, lastKey: waypointsKey, lastNonce: nonce } };
}

/**
 * Memory after a needs plan is written to the table. The waypoint planner takes over at the EVA start with this route
 * as its own, so locking the needs plans nothing again.
 * @param {object} memory
 * @param {{ key: string, waypointsKey: string, nonce: number, mastId: string }} plan
 */
export function afterNeedsPlan(memory, { key, waypointsKey, nonce, mastId }) {
  return {
    ...memory,
    needsKey: key,
    plannedWaypointsKey: waypointsKey,
    lastKey: waypointsKey,
    lastNonce: nonce,
    lastMast: mastId,
    appliedPlanId: `${nonce}|${waypointsKey}`,
  };
}

/** Memory after a waypoint plan is written to route.path. */
export function afterWaypointPlan(memory, planId) {
  return { ...memory, appliedPlanId: planId };
}

/**
 * One planner request in flight at a time, and only the newest one waiting (N16). The worker plans one request after
 * another and a request takes 0.3 to 1 s on the real terrain, so a slider drag would otherwise queue a plan per step.
 *
 * request(job) queues `job.run()` (a function returning a promise). A job still waiting is dropped for the newer one;
 * the job running finishes, and its result is dropped if a newer job is waiting or it was cancelled. Only the result of
 * the newest job reaches `job.done(result)` (or `job.failed(error)`).
 * @returns {{ request: (job: { run: () => Promise<any>, done: (result: any) => void, failed?: (error: any) => void })
 *   => () => void, busy: () => boolean }} request returns the job's cancel
 */
export function createLatestOnly() {
  let running = null;
  let waiting = null;

  function pump() {
    if (running || !waiting) return;
    const job = waiting;
    waiting = null;
    running = job;
    const finish = (deliver) => {
      running = null;
      if (!job.cancelled && !waiting) deliver();
      pump();
    };
    let started;
    try {
      started = Promise.resolve(job.run());
    } catch (error) {
      started = Promise.reject(error);
    }
    started.then((result) => finish(() => job.done(result)), (error) => finish(() => job.failed?.(error)));
  }

  return {
    request(job) {
      if (waiting) waiting.cancelled = true;
      waiting = job;
      pump();
      return () => {
        job.cancelled = true;
        if (waiting === job) waiting = null;
      };
    },
    busy: () => Boolean(running || waiting),
  };
}
