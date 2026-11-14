import { useEffect, useState } from 'react';
import EventBanner from '../events/EventBanner.jsx';
import { useMissionStore, setLayer } from '../state/store.js';
import { radioShadowCells } from '../sim/radio.js';
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
  const [radioShadow, setRadioShadow] = useState(false);
  const planner = useRoutePlanner({ waypoints, enabled: active });

  const setWaypoints = (list) => {
    useMissionStore.setState((state) => ({
      route: { ...state.route, waypoints: list, decision: 'pending' },
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

  // Radio shadow is a separate ground overlay, not one of the four shader
  // layers. It is computed only while the toggle is on and Plan mode is active.
  useEffect(() => {
    if (!engine) return undefined;
    if (!active || !radioShadow) {
      engine.setRadioShadow(null);
      return undefined;
    }
    const mast = engine.getHabitatMast();
    if (!mast) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      const cells = radioShadowCells({ mast, lineOfSight: engine.lineOfSight });
      if (!cancelled) engine.setRadioShadow(cells);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine.setRadioShadow(null);
    };
  }, [engine, active, radioShadow]);

  if (!active) return null;

  // One grid for the whole screen (plan.css): layers on the left, the route on the right, alerts at the top
  // of the free centre column, map chrome along the bottom. Regions never share space, so nothing overlaps.
  return (
    <>
      {/* Full-viewport canvas, outside the grid: engine.project() returns viewport coordinates. */}
      <PlanPositionMarker engine={engine} />

      <div className="plan-ui">
        <div className="plan-region plan-left">
          <LayerPanel layer={layer} onLayer={setLayer} radioShadow={radioShadow} onRadioShadow={setRadioShadow} />
          <SourcesButton />
        </div>

        <div className="plan-region plan-alerts">
          <EventBanner />
        </div>

        <div className="plan-region plan-right">
          <RoutePanel planner={planner} waypoints={waypoints} onWaypointsChange={setWaypoints} engine={engine} />
        </div>

        <div className="plan-region plan-foot">
          <PlanChrome metresPerPixel={metresPerPixel} />
          <p className="plan-readout" role="status">
            {routeStatus === 'error'
              ? 'route.json could not be loaded; markers are unavailable.'
              : 'North up · 1422 × 1500 m tile · origin at Cheyava Falls'}
          </p>
        </div>
      </div>
    </>
  );
}
