import { useEffect, useRef, useState } from 'react';
import { loadCostGrid, loadDataFile } from '../data/dataFiles.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { heightAt } from '../sim/costGrid.js';
import { mastKey, profileSources, summariseProfiles } from '../sim/routeProfiles.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { useMissionStore, withRouteProfile } from '../state/store.js';
import { ROUTE_SOURCES, waypointKey } from './routePlan.js';

/** How often to ask the engine for the habitat mast until the habitat has loaded. Milliseconds. */
const MAST_POLL_MS = 500;

const validMast = (mast) => Boolean(mast) && Number.isFinite(mast.x) && Number.isFinite(mast.z);

function samePath(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((point, k) => point[0] === b[k][0] && point[1] === b[k][1]);
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
 * Loads the terrain and hazard data, keeps one planner worker alive, and re-plans whenever the waypoints change in
 * Plan mode. Each plan is one route per route profile (fastest, gentlest, radio contact; #245): all of them go to
 * route.profiles for the table to compare, and the chosen one (route.profile) becomes route.path.
 *
 * @param {{ waypoints: Array<{ name: string, x: number, z: number }>, enabled: boolean, engine?: object | null }} options
 *   engine: gives the habitat mast for the radio-contact profile; without it that profile has no route
 * @returns {{ status: 'loading' | 'ready' | 'planning' | 'error', error: string | null, replan: () => void }}
 */
export function useRoutePlanner({ waypoints, enabled, engine = null }) {
  const [state, setState] = useState({ status: 'loading', error: null });
  const [dataReady, setDataReady] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mast = useHabitatMast(engine);
  const clientRef = useRef(null);
  const heightAtRef = useRef(null);
  const constantsRef = useRef(null);
  const sourcesRef = useRef({});
  const lastKeyRef = useRef('');
  const lastNonceRef = useRef(-1);
  const lastMastRef = useRef('');
  const appliedRef = useRef('');   // nonce|waypoint key of the last plan written to route.path
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let client = null;

    Promise.all([loadCostGrid(), loadDataFile(HAZARDS_PATH)])
      .then(async ([grid, hazards]) => {
        client = createRoutePlannerClient();
        await client.setGrid(grid);
        if (cancelled) {
          client.terminate();
          return;
        }
        clientRef.current = client;
        heightAtRef.current = (x, z) => heightAt(grid, x, z);
        constantsRef.current = suitConstantsFromHazards(hazards);
        sourcesRef.current = profileSources(hazards);
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
    if (!dataReady || !clientRef.current || waypoints.length < 2) return undefined;

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

    const timer = setTimeout(() => {
      if (!mastOnly) setState((current) => (current.status === 'planning' ? current : { ...current, status: 'planning' }));
      client
        .profiles(waypoints, { mast })
        .then((planned) => {
          if (request !== requestRef.current) return;
          const profiles = summariseProfiles(planned, waypoints, heightAtRef.current, constantsRef.current);

          if (mastOnly) {
            useMissionStore.setState((store) => {
              const current = store.route;
              const chosen = profiles[current.profile];
              // Keep the walked path's reference, so the table still marks this profile as the one in use.
              if (chosen?.ok && samePath(chosen.path, current.path)) profiles[current.profile] = { ...chosen, path: current.path };
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
            const route = withRouteProfile(base, store.route.profile) ?? withRouteProfile(base, 'fastest');
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
    }, 120);

    return () => {
      clearTimeout(timer);
      if (request === requestRef.current) requestRef.current += 1;
    };
  }, [enabled, dataReady, waypoints, nonce, mast]);

  const status = !enabled && state.status === 'planning' ? 'ready' : state.status;
  return {
    status,
    error: state.error,
    replan: () => setNonce((value) => value + 1),
  };
}
