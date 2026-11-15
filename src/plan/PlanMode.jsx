import { useEffect } from 'react';
import { useMissionStore } from '../state/store.js';
import MissionTable from './MissionTable.jsx';
import { useRoutePlanner } from './useRoutePlanner.js';
import { startAtAirlock } from './routeStart.js';
import { loadDataFile, ROUTE_PATH } from '../data/dataFiles.js';
import { SHELTERS_PATH } from '../sim/shelters.js';


/**
 * Plan mode: the mission table in the habitat (#11). It loads the route, keeps the planner running and hands the
 * waypoints to the engine (the minimap and the 3D markers use them); the table itself is plain interface over a
 * picture of the habitat, with its own flat map (MissionMap.jsx).
 *
 * @param {{ engine: object | null, active: boolean, onBeginEva?: () => void, onClose?: () => void, onControls?: () => void }} props
 *   active: the table is open, which happens only at the table in the habitat before the EVA (habitat-first flow).
 */
export default function PlanMode({ engine, active, onBeginEva, onClose, onControls }) {
  const waypoints = useMissionStore((s) => s.route.waypoints);
  const planner = useRoutePlanner({ waypoints, enabled: active, engine });

  // route.json holds the five placeholder waypoints from the assets team. The route starts at the airlock (#166);
  // without shelters.json it starts at the HAB waypoint as before.
  useEffect(() => {
    let cancelled = false;
    const shelters = loadDataFile(SHELTERS_PATH).catch(() => null);
    loadDataFile(ROUTE_PATH)
      .then(async (route) => {
        const start = await shelters;
        if (cancelled) return;
        useMissionStore.setState((state) => ({
          route: { ...state.route, waypoints: startAtAirlock(route.waypoints ?? [], start) },
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The engine owns the markers; React only supplies the data.
  useEffect(() => {
    if (!engine) return;
    engine.setWaypoints(
      waypoints.map((waypoint) => ({
        x: waypoint.x,
        z: waypoint.z,
        name: waypoint.name,
        active: false,
      })),
    );
  }, [engine, waypoints]);

  if (!active) return null;

  return <MissionTable planner={planner} waypoints={waypoints} onBeginEva={onBeginEva} onClose={onClose} onControls={onControls} />;
}
