import { useEffect, useRef, useState } from 'react';
import { loadCostGrid, loadDataFile, ROUTE_PATH } from '../data/dataFiles.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { routeStopCandidates, STOPS_PATH } from '../data/stops.js';
import { parseTraverse, TRAVERSE_PATH } from '../data/traverse.js';
import { heightAt } from '../sim/costGrid.js';
import { startConsumables, waypointsForCosts } from '../sim/legCosts.js';
import { riskPricing, siteStart } from '../sim/missionNeeds.js';
import { mastKey, profileSources, summariseProfiles } from '../sim/routeProfiles.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { useMissionStore, withRouteProfile } from '../state/store.js';
import {
  afterNeedsPlan, afterWaypointPlan, alertRouteActive, createLatestOnly, decidePlan, emptyPlannerMemory, failedNeedsRoute, needsPlanKey, needsPlanPending,
  plansFromNeeds, resumeStops,
} from './plannerState.js';
import { ROUTE_SOURCES, waypointKey } from './routePlan.js';
import { startAtAirlock } from './routeStart.js';

/** How often to ask the engine for the habitat mast until the habitat has loaded. Milliseconds. */
const MAST_POLL_MS = 500;
/** Wait this long after the last change before planning, so a slider drag plans once. Milliseconds. */
const PLAN_DEBOUNCE_MS = 120;

const validMast = (mast) => Boolean(mast) && Number.isFinite(mast.x) && Number.isFinite(mast.z);

function samePath(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((point, k) => point[0] === b[k][0] && point[1] === b[k][1]);
}

/**
 * The route with the planned profile in use. `profile` stays the crew's choice at the table (#245): a solo crew walks
 * the radio-contact route (missionNeeds.js) but keeps its choice for when a partner joins. Null when that profile has
 * no route.
 * @param {object} base the store's route with the new profiles
 * @param {string} use the profile to walk
 * @param {string} chosen the profile chosen at the table
 */
function routeOnProfile(base, use, chosen) {
  const route = withRouteProfile(base, use);
  return route ? { ...route, profile: chosen } : null;
}

/**
 * A re-plan of the same waypoints during the EVA (Re-plan at the table, needs locked) keeps the walk so far: the
 * waypoints reached and the next one (withRouteProfile starts a plan from the airlock, nextIndex 0). Before the EVA the
 * new route starts at the airlock as before (R5).
 * @param {object | null} route the re-planned route
 * @param {{ nextIndex?: number, visited?: string[] }} current the store's route before it
 * @param {boolean} evaBegun needs.locked
 */
export function keepWalkProgress(route, current, evaBegun) {
  if (!route || !evaBegun) return route;
  return { ...route, nextIndex: current?.nextIndex ?? route.nextIndex, visited: Array.isArray(current?.visited) ? current.visited : route.visited };
}

/**
 * The habitat mast from the engine, once the habitat has loaded: the radio-contact profile prices the ground the
 * mast cannot see (#245). Null without an engine.
 * @param {object | null} engine
 */
function useHabitatMast(engine) {
  const [mast, setMast] = useState(null);
  useEffect(() => {
    if (!engine || typeof engine.getHabitatMast !== 'function') return undefined;
    let timer = null;
    const poll = () => {
      const found = engine.getHabitatMast();
      if (validMast(found)) setMast({ x: found.x, y: found.y, z: found.z });
      else timer = setTimeout(poll, MAST_POLL_MS);
    };
    poll();
    return () => clearTimeout(timer);
  }, [engine]);
  return mast;
}

/**
 * The site the needs planner works on: the start at the airlock (route.json's HAB moved there, routeStart.js), the
 * candidate stops of stops.json, Perseverance's drives for the cautious discount, and the suit constants. Without
 * shelters.json the route starts at the HAB waypoint; without traverse.json the cautious crew has no rover ground to
 * prefer; without stops.json there is nothing to choose and the planner routes the waypoints as given.
 */
function buildSite(routeJson, sheltersJson, stopsJson, traverseJson, constants) {
  let stops = [];
  try {
    stops = stopsJson ? routeStopCandidates(stopsJson) : [];
  } catch (error) {
    console.error('stops.json not usable, the route is not planned from the needs:', error);
  }
  let traverse = null;
  try {
    traverse = traverseJson ? parseTraverse(traverseJson).drives.map((d) => d.points) : null;
  } catch {
    traverse = null;
  }
  return { start: siteStart(startAtAirlock(routeJson?.waypoints ?? [], sheltersJson)), stops, traverse, constants };
}

/**
 * Loads the terrain and the site data, keeps one planner worker alive, and plans in Plan mode.
 *
 * Before the EVA begins the route comes from the crew's needs (store `needs`, src/sim/missionNeeds.js): the worker
 * chooses the stops, the profile and the budget, then plans one route per profile on those stops (#245). This hook
 * writes the planned waypoints to route.waypoints (the habitat airlock first), the chosen and dropped stops, the sampling
 * tasks of a Collect samples plan (route.tasks, #352), the reason codes, the budget, the risk weights and the per-leg
 * explanation (#246), and makes the profile in use route.path. It re-plans whenever the needs (the sampling tasks
 * included), the profile chosen at the table or the habitat mast change.
 *
 * Once the EVA has begun (needs.locked) the needs no longer change, and the hook re-plans the waypoints as they stand,
 * as before: a find accepted in Walk (#71) or Re-plan, with the risk pricing of the needs the EVA started with.
 *
 * The decisions are in plannerState.js (tested there). One request is in flight at a time and only the newest waits
 * (N16); the status is 'planning' from the moment the needs differ from the plan on the table (N15).
 *
 * @param {{ waypoints: Array<{ name: string, x: number, z: number }>, enabled: boolean, engine?: object | null }} options
 *   waypoints: route.waypoints; engine: gives the habitat mast for the radio-contact profile; without it that profile
 *   has no route
 * @returns {{ status: 'loading' | 'ready' | 'planning' | 'error', error: string | null, replan: () => void,
 *   mast: { x: number, y: number, z: number } | null }} mast: the habitat mast once the habitat has loaded, for the
 *   mission table map's Radio shadow layer (the same mast the radio-contact profile prices)
 */
export function useRoutePlanner({ waypoints, enabled, engine = null }) {
  const [state, setState] = useState({ status: 'loading', error: null });
  const [site, setSite] = useState(null);   // set once the terrain is in the worker: also "data ready"
  const [appliedNeedsKey, setAppliedNeedsKey] = useState('');
  const [nonce, setNonce] = useState(0);
  const [queue] = useState(createLatestOnly);
  const mast = useHabitatMast(engine);
  const needs = useMissionStore((s) => s.needs);
  const chosenProfile = useMissionStore((s) => s.route.profile);
  const clientRef = useRef(null);
  const heightAtRef = useRef(null);
  const constantsRef = useRef(null);
  const sourcesRef = useRef({});
  const memoryRef = useRef(emptyPlannerMemory());
  const plannedWaypointsRef = useRef(null);   // the waypoints of the needs plan on the table
  const aliveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let client = null;
    aliveRef.current = true;
    const optional = (path) => loadDataFile(path).catch(() => null);

    Promise.all([loadCostGrid(), loadDataFile(HAZARDS_PATH), loadDataFile(ROUTE_PATH), optional(SHELTERS_PATH), optional(STOPS_PATH), optional(TRAVERSE_PATH)])
      .then(async ([grid, hazards, routeJson, sheltersJson, stopsJson, traverseJson]) => {
        client = createRoutePlannerClient();
        await client.setGrid(grid);
        if (cancelled) {
          client.terminate();
          return;
        }
        clientRef.current = client;
        heightAtRef.current = (x, z) => heightAt(grid, x, z);
        constantsRef.current = suitConstantsFromHazards(hazards);
        // the plan's fields (route.stops, route.budget, route.explain ...) resolve from the registry, src/data/provenance.js
        sourcesRef.current = profileSources(hazards);
        setSite(buildSite(routeJson, sheltersJson, stopsJson, traverseJson, constantsRef.current));
        setState({ status: 'ready', error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (client) client.terminate();
      clientRef.current = null;
    };
  }, []);

  const fromNeeds = plansFromNeeds(needs, site);
  const mastId = mastKey(mast);
  const needsKeyNow = needsPlanKey({ needs, profile: chosenProfile, nonce, mastId });

  useEffect(() => {
    const client = clientRef.current;
    const decision = decidePlan({
      enabled, ready: Boolean(site && client), fromNeeds, needs, profile: chosenProfile, nonce, mastId,
      waypointsKey: waypointKey(waypoints), waypointCount: waypoints.length,
      findsRouteKey: useMissionStore.getState().finds?.routeKey ?? null,
      sheltered: alertRouteActive(useMissionStore.getState().route, useMissionStore.getState().alerts),
    }, memoryRef.current);
    memoryRef.current = decision.memory;

    const planning = () => setState((current) => (current.status === 'planning' ? current : { ...current, status: 'planning' }));
    const failed = (error) => {
      if (!aliveRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      useMissionStore.setState((store) => ({ route: { ...store.route, path: null, reason: message } }));
      setState({ status: 'error', error: message });
    };
    // Debounced, then through the queue: one request in flight, only the newest waiting. The cleanup cancels it.
    const schedule = (job) => {
      let cancel = null;
      const timer = setTimeout(() => { cancel = queue.request(job); }, PLAN_DEBOUNCE_MS);
      return () => {
        clearTimeout(timer);
        if (cancel) cancel();
      };
    };

    switch (decision.action) {
      case 'restore-waypoints': {
        // Something else wrote route.waypoints (Plan mode loads route.json's anchors when it opens): route.path was
        // planned through the planned stops, so put them back.
        const planned = plannedWaypointsRef.current;
        if (planned) useMissionStore.setState((store) => ({ route: { ...store.route, waypoints: planned } }));
        return undefined;
      }
      case 'consume-find':
        useMissionStore.setState((s) => ({ finds: { ...s.finds, routeKey: null } }));   // used once: a later edit plans as usual
        return undefined;
      case 'plan-needs':
        planning();
        return schedule(needsJob(decision.key));
      case 'plan-waypoints':
        planning();
        return schedule(waypointsJob(decision.planId, false, decision.resume === true));
      case 'refresh-mast':
        return schedule(waypointsJob(decision.planId, true, false));
      default:
        return undefined;
    }

    // The route from the crew's needs, before the EVA.
    function needsJob(key) {
      return {
        run: () => client.needs({ ...needs, profile: chosenProfile }, site, { mast }),
        failed: (error) => {
          // the failure is the answer to these needs: show it instead of waiting for a plan
          memoryRef.current = { ...memoryRef.current, needsKey: key };
          if (aliveRef.current) setAppliedNeedsKey(key);
          failed(error);
        },
        done: ({ plan, profiles: planned }) => {
          if (!aliveRef.current) return;
          const start = startConsumables(plan.needs, constantsRef.current);
          const profiles = planned ? summariseProfiles(planned, plan.waypoints, heightAtRef.current, constantsRef.current, start) : null;
          // tasks: the sampling tasks of a Collect samples plan, kept and dropped (#352); empty for the other goals
          const fields = {
            waypoints: plan.waypoints, stops: plan.stops, dropped: plan.dropped, planReasons: plan.reasons,
            budget: plan.budget, weights: plan.weights, profiles, tasks: plan.tasks ?? [],
          };
          memoryRef.current = afterNeedsPlan(memoryRef.current, { key, waypointsKey: waypointKey(plan.waypoints), nonce, mastId });
          plannedWaypointsRef.current = plan.waypoints;
          setAppliedNeedsKey(key);

          const inUse = plan.ok ? profiles?.[plan.profile] : null;
          if (!inUse?.ok) {
            const reason = plan.ok ? planned?.[plan.profile]?.reason ?? 'No route found' : 'No route found';
            useMissionStore.setState((store) => ({
              route: failedNeedsRoute(store.route, fields, { reason, objective: plan.needs?.objective ?? needs.objective }),
              sources: { ...store.sources, ...sourcesRef.current },
            }));
            setState({ status: 'error', error: reason });
            return;
          }
          useMissionStore.setState((store) => {
            const route = routeOnProfile({ ...store.route, ...fields }, plan.profile, plan.requestedProfile);
            return { route, sources: { ...store.sources, ...ROUTE_SOURCES, ...sourcesRef.current } };
          });
          setState({ status: 'ready', error: null });
        },
      };
    }

    // The waypoints as they stand, once the EVA has begun (or when stops.json gave nothing to choose from). mastOnly:
    // the mast arrived for the route already on the table; refresh the comparison and keep the route being walked.
    // resume: the plan answers Re-plan, so the stops an event left out come back (D12).
    function waypointsJob(planId, mastOnly, resume) {
      const planned = waypoints;
      // The EVA keeps the risk pricing and the consumables of the needs it started with.
      const options = { mast, pricing: riskPricing(needs.risk), traverse: site?.traverse ?? null, constants: constantsRef.current };
      const start = startConsumables(needs, constantsRef.current);
      const soloRadio = needs.crew === 1;
      return {
        run: () => client.profiles(planned, options),
        failed: (error) => { if (!mastOnly) failed(error); },   // a failed refresh leaves the route on the table as it is
        done: (result) => {
          if (!aliveRef.current) return;
          // no work counted again at the stops already reached during the EVA (N6, as route.totals)
          const now = useMissionStore.getState().route;
          const costed = waypointsForCosts({ ...now, waypoints: planned, skipped: resume ? [] : now.skipped });
          const profiles = summariseProfiles(result, costed, heightAtRef.current, constantsRef.current, start);
          if (mastOnly) {
            useMissionStore.setState((store) => {
              const current = store.route;
              // Keep the walked path's reference, so the table still marks the profile in use (radio for a solo crew).
              for (const [id, entry] of Object.entries(profiles)) {
                if (entry?.ok && samePath(entry.path, current.path)) profiles[id] = { ...entry, path: current.path };
              }
              return { route: { ...current, profiles }, sources: { ...store.sources, ...sourcesRef.current } };
            });
            return;
          }
          memoryRef.current = afterWaypointPlan(memoryRef.current, planId);
          if (!profiles.fastest?.ok) {
            const reason = result.fastest?.reason ?? 'No route found';
            useMissionStore.setState((store) => ({ route: { ...store.route, path: null, profiles, reason } }));
            setState({ status: 'error', error: reason });
            return;
          }
          useMissionStore.setState((store) => {
            if (alertRouteActive(store.route, store.alerts)) return store;   // an event's route came in meanwhile: keep it (B1)
            const base = { ...store.route, profiles };
            const chosen = store.route.profile;
            const use = soloRadio && profiles.radio?.ok ? 'radio' : chosen;
            const evaBegun = store.needs?.locked === true;
            const kept = keepWalkProgress(routeOnProfile(base, use, chosen) ?? routeOnProfile(base, 'fastest', chosen), store.route, evaBegun);
            const route = resumeStops(kept, resume && evaBegun);
            return { route, sources: { ...store.sources, ...ROUTE_SOURCES, ...sourcesRef.current } };
          });
          setState({ status: 'ready', error: null });
        },
      };
    }
    // mastId and fromNeeds are derived from mast, needs and site, which are in the list.
  }, [enabled, site, waypoints, nonce, mast, needs, chosenProfile]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The route on the table is older than the needs from the moment they change, not only once the request is sent
  // 120 ms later, so Begin EVA can never lock the old route (N15).
  const pending = enabled && Boolean(site) && state.status !== 'loading' && needsPlanPending({ fromNeeds, key: needsKeyNow }, { needsKey: appliedNeedsKey });
  const status = pending ? 'planning' : !enabled && state.status === 'planning' ? 'ready' : state.status;
  return {
    status,
    error: pending ? null : state.error,
    replan: () => setNonce((value) => value + 1),
    mast,
  };
}
