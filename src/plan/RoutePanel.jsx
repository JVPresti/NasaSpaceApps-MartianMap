import { useState } from 'react';
import { setRouteDecision, useMissionStore } from '../state/store.js';
import { planSummary } from './routePlan.js';

function WaypointRow({ waypoint, index, onCommit }) {
  const [x, setX] = useState(String(Math.round(waypoint.x)));
  const [z, setZ] = useState(String(Math.round(waypoint.z)));

  const commit = () => {
    const nextX = Number(x);
    const nextZ = Number(z);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextZ)) {
      setX(String(Math.round(waypoint.x)));
      setZ(String(Math.round(waypoint.z)));
      return;
    }
    if (nextX !== waypoint.x || nextZ !== waypoint.z) {
      onCommit(index, { ...waypoint, x: nextX, z: nextZ });
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setX(String(Math.round(waypoint.x)));
      setZ(String(Math.round(waypoint.z)));
      event.currentTarget.blur();
    }
  };

  return (
    <li className="route-waypoint">
      <span className="waypoint-number">{index + 1}</span>
      <span className="waypoint-name" title={waypoint.name}>
        {waypoint.name}
      </span>
      <label>
        <span>x</span>
        <input
          type="number"
          step="1"
          inputMode="numeric"
          value={x}
          aria-label={`${waypoint.name} x metres`}
          onChange={(event) => setX(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </label>
      <label>
        <span>z</span>
        <input
          type="number"
          step="1"
          inputMode="numeric"
          value={z}
          aria-label={`${waypoint.name} z metres`}
          onChange={(event) => setZ(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </label>
    </li>
  );
}

/**
 * Route summary, waypoint editing and the go / no-go decision.
 * @param {{ planner: { status: string, error: string | null, replan: () => void },
 *   waypoints: Array<{ name: string, x: number, z: number }>,
 *   onWaypointsChange: (waypoints: Array<object>) => void }} props
 */
export default function RoutePanel({ planner, waypoints, onWaypointsChange }) {
  const route = useMissionStore((s) => s.route);
  const summary = planSummary(route);
  const decision = route.decision;
  const planning = planner.status === 'planning';
  const statusText =
    planner.status === 'loading'
      ? 'Loading terrain and hazard data…'
      : planning
        ? 'Planning route…'
        : planner.status === 'error'
          ? planner.error
          : route.path
            ? 'Route ready. Walk mode follows the same line.'
            : 'Waiting for the first plan…';

  const commitWaypoint = (index, waypoint) => {
    const next = waypoints.map((item, itemIndex) => (itemIndex === index ? waypoint : item));
    onWaypointsChange(next);
  };

  return (
    <aside className="plan-panel route-panel" aria-label="Planned route and cost">
      <header className="plan-panel-head">
        <p className="plan-kicker">A* · HiRISE DEM</p>
        <h2>Route</h2>
      </header>

      <dl className="route-metrics">
        <div>
          <dt>Distance</dt>
          <dd>{summary.distance}</dd>
        </div>
        <div>
          <dt>Climb</dt>
          <dd>{summary.climb}</dd>
        </div>
        <div>
          <dt>Steepest</dt>
          <dd>{summary.steepest}</dd>
        </div>
        <div>
          <dt>Walk time</dt>
          <dd>{summary.eta}</dd>
        </div>
      </dl>

      <p className={`route-status ${planner.status}`} role="status">
        {statusText}
      </p>

      <section className="plan-section">
        <h3>Waypoints · x / z metres</h3>
        <ol className="route-waypoints">
          {waypoints.map((waypoint, index) => (
            <WaypointRow
              key={`${index}-${waypoint.name}-${Math.round(waypoint.x)}-${Math.round(waypoint.z)}`}
              waypoint={waypoint}
              index={index}
              onCommit={commitWaypoint}
            />
          ))}
        </ol>
      </section>

      <div className="route-actions">
        <button type="button" className="route-replan" onClick={planner.replan} disabled={planning}>
          Re-plan
        </button>
        <div className="route-decision" role="group" aria-label="Go or no-go">
          <button
            type="button"
            className={decision === 'go' ? 'on go' : undefined}
            aria-pressed={decision === 'go'}
            disabled={!route.path}
            onClick={() => setRouteDecision('go')}
          >
            Go
          </button>
          <button
            type="button"
            className={decision === 'no-go' ? 'on no-go' : undefined}
            aria-pressed={decision === 'no-go'}
            onClick={() => setRouteDecision('no-go')}
          >
            No-go
          </button>
        </div>
      </div>
    </aside>
  );
}
