import { useState } from 'react';
import { setRouteDecision, useMissionStore } from '../state/store.js';
import ElevationProfile from '../hud/ElevationProfile.jsx';
import RouteLegs from './RouteLegs.jsx';
import { fixed as num, minutesFixed as min, routeMetrics } from './routePlan.js';
import SourceTag from './SourceTag.jsx';
import WaypointName from '../stops/WaypointName.jsx';

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
      {/* A waypoint with a science stop opens its card (#66). */}
      <WaypointName name={waypoint.name} />
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

function Metric({ metric }) {
  return (
    <div className="route-metric">
      <dt>
        {metric.label}
        <SourceTag path={metric.path} />
      </dt>
      <dd>
        <span className="metric-value">{metric.value}</span>
        <span className={metric.unit === '°' ? 'unit unit-tight' : 'unit'}>{metric.unit}</span>
        {metric.detail && <span className="metric-detail">{metric.detail}</span>}
      </dd>
    </div>
  );
}

/** The reason under the go / no-go buttons: planner state first, then the oxygen margin from route.totals. */
function DecisionReason({ planner, route }) {
  const totals = route.totals;
  if (planner.status === 'loading') return <p className="decision-reason">Loading terrain and hazard data…</p>;
  if (planner.status === 'planning') return <p className="decision-reason planning" role="status">Planning route…</p>;
  if (planner.status === 'error') return <p className="decision-reason error" role="status">{planner.error}</p>;
  if (!route.path || !totals) return <p className="decision-reason">Waiting for the first plan…</p>;

  return (
    <div className={'decision-reason margin-' + totals.status}>
      <p className="decision-margin">
        Margin <b>{min(totals.marginSec)}</b>
        <span className="unit">min</span> over the 30 min reserve
        <SourceTag path="route.totals.marginSec" />
      </p>
      <p className="decision-detail">
        Back at the habitat: O2 <b>{num(totals.arrivalO2Pct)}</b>
        <span className="unit">%</span>, battery <b>{num(totals.arrivalBatteryPct)}</b>
        <span className="unit">%</span>.{' '}
        {totals.roundTrip ? (
          'Round trip.'
        ) : (
          <>
            Walk home <b>{min(totals.returnTimeSec)}</b>
            <span className="unit">min</span>, <b>{num(totals.returnO2G)}</b>
            <span className="unit">g</span> O2 with the 20 % pad.
          </>
        )}
      </p>
    </div>
  );
}

const DECISION_LABEL = { pending: 'Pending', go: 'Go', 'no-go': 'No-go' };

/**
 * One route panel for Plan mode: summary, elevation profile, go / no-go with its reason, cost per leg and the waypoint editor.
 * @param {{ planner: { status: string, error: string | null, replan: () => void },
 *   waypoints: Array<{ name: string, x: number, z: number }>,
 *   onWaypointsChange: (waypoints: Array<object>) => void,
 *   engine: object | null }} props
 */
export default function RoutePanel({ planner, waypoints, onWaypointsChange, engine }) {
  const route = useMissionStore((s) => s.route);
  const metrics = routeMetrics(route);
  const decision = route.decision;
  const planning = planner.status === 'planning';
  const skipped = route.skipped ?? [];

  const commitWaypoint = (index, waypoint) => {
    const next = waypoints.map((item, itemIndex) => (itemIndex === index ? waypoint : item));
    onWaypointsChange(next);
  };

  return (
    <aside className="plan-panel route-panel" aria-label="Planned route and cost">
      <header className="plan-panel-head">
        <h2>Route</h2>
        <p className="plan-panel-source">A* planner · HiRISE DTM</p>
      </header>

      <dl className="route-metrics">
        {metrics.map((metric) => (
          <Metric key={metric.key} metric={metric} />
        ))}
      </dl>

      <ElevationProfile
        path={route.path}
        waypoints={route.waypoints}
        heightAt={engine?.heightAt}
        slopeAt={engine?.slopeAt}
      />

      <section className="route-decision-block" aria-label="Go or no-go">
        <div className="decision-head">
          <h3>Go / no-go</h3>
          <span className={'decision-state ' + decision}>{DECISION_LABEL[decision] ?? decision}</span>
        </div>
        <DecisionReason planner={planner} route={route} />
        {skipped.length > 0 && (
          <p className="route-skipped">
            Re-planned for the event. Skipped: {skipped.join(' · ')}
          </p>
        )}
        <div className="route-actions">
          <button type="button" className="route-replan" onClick={planner.replan} disabled={planning}>
            Re-plan
          </button>
          <button
            type="button"
            className={decision === 'go' ? 'route-go on' : 'route-go'}
            aria-pressed={decision === 'go'}
            disabled={!route.path}
            onClick={() => setRouteDecision('go')}
          >
            Go
          </button>
          <button
            type="button"
            className={decision === 'no-go' ? 'route-nogo on' : 'route-nogo'}
            aria-pressed={decision === 'no-go'}
            onClick={() => setRouteDecision('no-go')}
          >
            No-go
          </button>
        </div>
      </section>

      <details className="plan-disclosure" open>
        <summary>Cost per leg</summary>
        <RouteLegs />
      </details>

      <details className="plan-disclosure">
        <summary>
          Waypoints <span className="disclosure-meta">{waypoints.length} · x / z in m</span>
        </summary>
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
      </details>
    </aside>
  );
}
