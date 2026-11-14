import { useEffect, useRef, useState } from 'react';
import { buildCostGrid, heightAt } from '../sim/costGrid.js';
import { createRoutePlannerClient } from '../sim/routePlannerClient.js';
import { suitConstantsFromHazards, walkCost } from '../sim/suitModel.js';
import { useMissionStore } from '../state/store.js';
import { ROUTE_SOURCES, waypointKey } from './routePlan.js';

const TERRAIN_URL = import.meta.env.BASE_URL + 'marswalk/assets/terrain.json';
const HAZARDS_URL = import.meta.env.BASE_URL + 'data/hazards.json';

/**
 * Loads the terrain and hazard data, keeps one planner worker alive, and
 * re-plans whenever the waypoints change in Plan mode.
 *
 * @param {{ waypoints: Array<{ name: string, x: number, z: number }>, enabled: boolean }} options
 * @returns {{ status: 'loading' | 'ready' | 'planning' | 'error', error: string | null, replan: () => void }}
 */
export function useRoutePlanner({ waypoints, enabled }) {
  const [state, setState] = useState({ status: 'loading', error: null });
  const [dataReady, setDataReady] = useState(false);
  const [nonce, setNonce] = useState(0);
  const clientRef = useRef(null);
  const heightAtRef = useRef(null);
  const constantsRef = useRef(null);
  const lastKeyRef = useRef('');
  const lastNonceRef = useRef(-1);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let client = null;

    Promise.all([
      fetch(TERRAIN_URL).then((response) => {
        if (!response.ok) throw new Error(`terrain.json ${response.status}`);
        return response.json();
      }),
      fetch(HAZARDS_URL).then((response) => {
        if (!response.ok) throw new Error(`hazards.json ${response.status}`);
        return response.json();
      }),
    ])
      .then(async ([terrainJson, hazards]) => {
        const grid = buildCostGrid(terrainJson);
        client = createRoutePlannerClient();
        await client.setGrid(grid);
        if (cancelled) {
          client.terminate();
          return;
        }
        clientRef.current = client;
        heightAtRef.current = (x, z) => heightAt(grid, x, z);
        constantsRef.current = suitConstantsFromHazards(hazards);
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
    if (key === lastKeyRef.current && nonce === lastNonceRef.current) return undefined;
    lastKeyRef.current = key;
    lastNonceRef.current = nonce;

    const request = requestRef.current + 1;
    requestRef.current = request;
    const client = clientRef.current;

    const timer = setTimeout(() => {
      setState((current) => (current.status === 'planning' ? current : { ...current, status: 'planning' }));
      client
        .plan(waypoints)
        .then((result) => {
          if (request !== requestRef.current) return;
          if (!result.ok) {
            useMissionStore.setState((store) => ({
              route: { ...store.route, path: null, reason: result.reason ?? 'No route found' },
            }));
            setState({ status: 'error', error: result.reason ?? 'No route found' });
            return;
          }

          const walk = walkCost(result.path, heightAtRef.current, constantsRef.current);
          useMissionStore.setState((store) => ({
            route: {
              ...store.route,
              path: result.path,
              distanceM: result.distance,
              climbM: result.climb,
              steepestSlopeDeg: result.steepestSlopeDeg,
              etaSec: walk.timeSec,
              reason: 'Planned route',
            },
            sources: { ...store.sources, ...ROUTE_SOURCES },
          }));
          setState({ status: 'ready', error: null });
        })
        .catch((error) => {
          if (request !== requestRef.current) return;
          const message = error instanceof Error ? error.message : String(error);
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
  }, [enabled, dataReady, waypoints, nonce]);

  const status = !enabled && state.status === 'planning' ? 'ready' : state.status;
  return {
    status,
    error: state.error,
    replan: () => setNonce((value) => value + 1),
  };
}
