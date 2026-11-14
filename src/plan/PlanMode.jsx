import { useEffect, useState } from 'react';
import { useMissionStore, setLayer } from '../state/store.js';
import LayerPanel from './LayerPanel.jsx';
import PlanChrome from './PlanChrome.jsx';
import PlanPositionMarker from './PlanPositionMarker.jsx';
import RoutePanel from './RoutePanel.jsx';
import SourcesButton from '../sources/SourcesButton.jsx';
import { useRoutePlanner } from './useRoutePlanner.js';
import './plan.css';

const ROUTE_URL = import.meta.env.BASE_URL + 'marswalk/assets/route.json';

/**
 * Plan mode overlay: layer switch, legends and map chrome over the engine's
 * top-down camera. The engine draws the terrain, the data layer and the
 * numbered waypoint markers; this component is only interface.
 *
 * @param {{ engine: object | null, active: boolean }} props
 */
export default function PlanMode({ engine, active }) {
  const layer = useMissionStore((s) => s.view.layer);
  const waypoints = useMissionStore((s) => s.route.waypoints);
  const [routeStatus, setRouteStatus] = useState('loading');
  const [metresPerPixel, setMetresPerPixel] = useState(0);
  const planner = useRoutePlanner({ waypoints, enabled: active });

  const setWaypoints = (list) => {
    useMissionStore.setState((state) => ({
      route: { ...state.route, waypoints: list, decision: 'pending', nextIndex: 0, visited: [] },   // an edited route starts over
    }));
  };

  // route.json holds the five placeholder waypoints from the assets team.
  useEffect(() => {
    let cancelled = false;
    fetch(ROUTE_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`route.json ${response.status}`);
        return response.json();
      })
      .then((route) => {
        if (cancelled) return;
        useMissionStore.setState((state) => ({
          route: { ...state.route, waypoints: route.waypoints ?? [] },
        }));
        setRouteStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setRouteStatus('error');
      });
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

  // Scale changes when the camera zooms. Four updates per second is enough for
  // a scale bar and does not turn into a per-frame React render.
  useEffect(() => {
    if (!engine || !active) return undefined;
    const update = () => {
      const value = engine.getPlanScale();
      if (value) setMetresPerPixel(value);
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [engine, active]);

  if (!active) return null;

  return (
    <div className="plan-ui">
      <PlanPositionMarker engine={engine} />
      <LayerPanel layer={layer} onLayer={setLayer} />

      <RoutePanel planner={planner} waypoints={waypoints} onWaypointsChange={setWaypoints} engine={engine} />
      <PlanChrome metresPerPixel={metresPerPixel} />
      <SourcesButton />

      <p className="plan-readout" role="status">
        {routeStatus === 'error'
          ? 'route.json could not be loaded; markers are unavailable.'
          : 'North up · 1422 × 1500 m tile · origin at Cheyava Falls'}
      </p>
    </div>
  );
}
