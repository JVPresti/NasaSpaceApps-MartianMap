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
 * @param {{ engine: object | null, active: boolean, evaBegun?: boolean, onBeginEva?: () => void, onControls?: () => void,
 *   initialTab?: 'site' | 'route' | 'hazards' | 'suit' }} props
 *   initialTab: the table step to open on (the habitat table's "Open plan" passes 'route'); the Site step by default
 */
export default function PlanMode({ engine, active, evaBegun = false, onBeginEva, onControls, initialTab = 'site' }) {
  const waypoints = useMissionStore((s) => s.route.waypoints);
  const planner = useRoutePlanner({ waypoints, enabled: active, engine });

  // route.json holds the five placeholder waypoints from the assets team. The route starts at the airlock (#166);
  // without shelters.json it starts at the HAB waypoint as before. The planner chooses the stops from the crew's needs
  // (useRoutePlanner, src/sim/missionNeeds.js), so these anchors are only the fallback while nothing has planned yet
  // (or when stops.json gives nothing to choose from): they never replace a planned list.
  useEffect(() => {
    let cancelled = false;
    const shelters = loadDataFile(SHELTERS_PATH).catch(() => null);
    loadDataFile(ROUTE_PATH)
      .then(async (route) => {
        const start = await shelters;
        if (cancelled) return;
        useMissionStore.setState((state) => (state.route.waypoints.length > 0 ? state : {
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

  return <MissionTable planner={planner} waypoints={waypoints} evaBegun={evaBegun} onBeginEva={onBeginEva} onControls={onControls} initialTab={initialTab} />;
}
