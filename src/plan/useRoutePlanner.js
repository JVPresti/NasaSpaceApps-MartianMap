import { useEffect, useRef, useState } from 'react';
import { loadCostGrid, loadDataFile, ROUTE_PATH } from '../data/dataFiles.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { routeStopCandidates, STOPS_PATH } from '../data/stops.js';
import { parseTraverse, TRAVERSE_PATH } from '../data/traverse.js';
import { heightAt } from '../sim/costGrid.js';
import { startConsumables } from '../sim/legCosts.js';
import { needsKey, planSources, riskPricing, siteStart } from '../sim/missionNeeds.js';
import { mastKey, profileSources, summariseProfiles } from '../sim/routeProfiles.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { useMissionStore, withRouteProfile } from '../state/store.js';
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
 * writes the planned waypoints to route.waypoints (the habitat airlock first), the chosen and dropped stops, the reason
 * codes, the budget, the risk weights and the per-leg explanation (#246), and makes the profile in use route.path. It
 * re-plans whenever the needs, the profile chosen at the table or the habitat mast change.
 *
 * Once the EVA has begun (needs.locked) the needs no longer change, and the hook re-plans the waypoints as they stand,
 * as before: a find accepted in Walk (#71) or Re-plan, with the risk pricing of the needs the EVA started with.
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
  const [dataReady, setDataReady] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mast = useHabitatMast(engine);
  const needs = useMissionStore((s) => s.needs);
  const chosenProfile = useMissionStore((s) => s.route.profile);
  const clientRef = useRef(null);
  const heightAtRef = useRef(null);
  const constantsRef = useRef(null);
  const sourcesRef = useRef({});
  const siteRef = useRef(null);
  const lastKeyRef = useRef('');
  const lastNonceRef = useRef(-1);
  const lastMastRef = useRef('');
  const appliedRef = useRef('');   // nonce|waypoint key of the last plan written to route.path
  const appliedNeedsRef = useRef('');   // key of the needs plan on the table
  const plannedWaypointsRef = useRef(null);   // its waypoints
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let client = null;
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
        sourcesRef.current = { ...profileSources(hazards), ...planSources(hazards) };
        siteRef.current = buildSite(routeJson, sheltersJson, stopsJson, traverseJson, constantsRef.current);
        setState({ status: 'ready', error: null });
        setDataReady(true);
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
      requestRef.current += 1;
      if (client) client.terminate();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!dataReady || !clientRef.current) return undefined;
    const site = siteRef.current;
    const fromNeeds = !needs.locked && site?.start && site.stops.length > 0;
    return fromNeeds ? planFromNeedsEffect(site) : planWaypointsEffect();

    // The route from the crew's needs, before the EVA.
    function planFromNeedsEffect() {
      const mastId = mastKey(mast);
      const key = `${needsKey(needs)}|${chosenProfile}|${nonce}|${mastId}`;
      if (key === appliedNeedsRef.current) {
        // This plan is on the table. If something else wrote route.waypoints since (Plan mode loads route.json's
        // anchors when it opens), put the planned stops back: route.path was planned through them.
        const planned = plannedWaypointsRef.current;
        if (planned && waypointKey(waypoints) !== waypointKey(planned)) {
          useMissionStore.setState((store) => ({ route: { ...store.route, waypoints: planned } }));
        }
        return undefined;
      }

      const request = requestRef.current + 1;
      requestRef.current = request;
      const client = clientRef.current;
      const timer = setTimeout(() => {
        setState((current) => (current.status === 'planning' ? current : { ...current, status: 'planning' }));
        client
          .needs({ ...needs, profile: chosenProfile }, site, { mast })
          .then(({ plan, profiles: planned }) => {
            if (request !== requestRef.current) return;
            const start = startConsumables(plan.needs, constantsRef.current);
            const profiles = planned ? summariseProfiles(planned, plan.waypoints, heightAtRef.current, constantsRef.current, start) : null;
            const fields = {
              waypoints: plan.waypoints, stops: plan.stops, dropped: plan.dropped, planReasons: plan.reasons,
              budget: plan.budget, weights: plan.weights, profiles,
            };
            const wpKey = waypointKey(plan.waypoints);
            appliedNeedsRef.current = key;
            plannedWaypointsRef.current = plan.waypoints;
            // The waypoint planner below takes over at the EVA start: this route is already its route.
            lastKeyRef.current = wpKey;
            lastNonceRef.current = nonce;
            lastMastRef.current = mastId;
            appliedRef.current = `${nonce}|${wpKey}`;

            const inUse = plan.ok ? profiles?.[plan.profile] : null;
            if (!inUse?.ok) {
              const reason = plan.ok ? planned?.[plan.profile]?.reason ?? 'No route found' : 'No route found';
              useMissionStore.setState((store) => ({
                route: { ...store.route, ...fields, path: null, explain: [], reason },
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
          })
          .catch((error) => {
            if (request !== requestRef.current) return;
            const message = error instanceof Error ? error.message : String(error);
            useMissionStore.setState((store) => ({ route: { ...store.route, path: null, reason: message } }));
            setState({ status: 'error', error: message });
          });
      }, PLAN_DEBOUNCE_MS);

      return () => {
        clearTimeout(timer);
        if (request === requestRef.current) requestRef.current += 1;
      };
    }

    // The waypoints as they stand, once the EVA has begun (or when stops.json gave nothing to choose from).
    function planWaypointsEffect() {
      if (waypoints.length < 2) return undefined;
      const key = waypointKey(waypoints);
      const mastId = mastKey(mast);
      const planId = `${nonce}|${key}`;
      const sameRoute = key === lastKeyRef.current && nonce === lastNonceRef.current;
      if (sameRoute && mastId === lastMastRef.current) return undefined;
      lastMastRef.current = mastId;
      // Only the mast arrived (the habitat loads after the terrain) and this route is already on the table: refresh the
      // comparison with the radio profile, but keep the route being walked. The fastest and gentlest routes come out the
      // same, so nothing on the map moves. If the first plan was still running, it was cancelled: plan in full.
      const mastOnly = sameRoute && appliedRef.current === planId;
      if (!mastOnly) {
        // A find accepted in Walk (#71) already re-planned these waypoints from the player. Planning again from the
        // habitat would reset nextIndex and lose the walk so far. Re-plan still forces a new route.
        if (nonce === lastNonceRef.current && key === useMissionStore.getState().finds?.routeKey) {
          lastKeyRef.current = key;
          appliedRef.current = planId;
          useMissionStore.setState((s) => ({ finds: { ...s.finds, routeKey: null } }));   // used once: a later edit plans as usual
          return undefined;
        }
        lastKeyRef.current = key;
        lastNonceRef.current = nonce;
      }

      const request = requestRef.current + 1;
      requestRef.current = request;
      const client = clientRef.current;
      // The EVA keeps the risk pricing and the consumables of the needs it started with.
      const options = { mast, pricing: riskPricing(needs.risk), traverse: site?.traverse ?? null, constants: constantsRef.current };
      const start = startConsumables(needs, constantsRef.current);
      const soloRadio = needs.crew === 1;

      const timer = setTimeout(() => {
        if (!mastOnly) setState((current) => (current.status === 'planning' ? current : { ...current, status: 'planning' }));
        client
          .profiles(waypoints, options)
          .then((planned) => {
            if (request !== requestRef.current) return;
            const profiles = summariseProfiles(planned, waypoints, heightAtRef.current, constantsRef.current, start);

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

            appliedRef.current = planId;
            if (!profiles.fastest?.ok) {
              const reason = planned.fastest?.reason ?? 'No route found';
              useMissionStore.setState((store) => ({
                route: { ...store.route, path: null, profiles, reason },
              }));
              setState({ status: 'error', error: reason });
              return;
            }

            useMissionStore.setState((store) => {
              const base = { ...store.route, profiles };
              const chosen = store.route.profile;
              const use = soloRadio && profiles.radio?.ok ? 'radio' : chosen;
              const route = keepWalkProgress(routeOnProfile(base, use, chosen) ?? routeOnProfile(base, 'fastest', chosen), store.route, store.needs?.locked === true);
              return { route, sources: { ...store.sources, ...ROUTE_SOURCES, ...sourcesRef.current } };
            });
            setState({ status: 'ready', error: null });
          })
          .catch((error) => {
            if (request !== requestRef.current) return;
            const message = error instanceof Error ? error.message : String(error);
            if (mastOnly) return;   // the route on the table is still good; only the comparison is not refreshed
            useMissionStore.setState((store) => ({
              route: { ...store.route, path: null, reason: message },
            }));
            setState({ status: 'error', error: message });
          });
      }, PLAN_DEBOUNCE_MS);

      return () => {
        clearTimeout(timer);
        if (request === requestRef.current) requestRef.current += 1;
      };
    }
  }, [enabled, dataReady, waypoints, nonce, mast, needs, chosenProfile]);

  const status = !enabled && state.status === 'planning' ? 'ready' : state.status;
  return {
    status,
    error: state.error,
    replan: () => setNonce((value) => value + 1),
    mast,
  };
}
