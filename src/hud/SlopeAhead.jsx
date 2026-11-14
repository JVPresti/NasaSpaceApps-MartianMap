import { useEffect, useRef, useState } from 'react';
import { useMissionStore } from '../state/store.js';
import { requestSlopeDetour } from '../state/slopeDetour.js';
import { positionAlongPath } from './profile.js';
import { applyPlannedRoute } from '../sim/routeUpdate.js';
import {
  SLOPE_NO_GO_DEG,
  detourExtra,
  lookAhead,
  noGoCells,
} from '../sim/slopeAhead.js';
import { ETA_SPEED_MS } from './format.js';

const ZONE_REFRESH_MS = 500;
const MOVE_EPSILON_M = 0.2;

/**
 * Slope look-ahead warning (#69): a red zone on the ground, a small map and a
 * detour button that asks the shared A* worker for a route around the blocked
 * cells.
 */
export default function SlopeAhead({ engine }) {
  const nav = useMissionStore((s) => s.navigation);
  const eventActive = useMissionStore((s) => Object.values(s.alerts ?? {}).some((alert) => alert && alert.active));
  const [warning, setWarning] = useState(null);
  const [detour, setDetour] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const zoneRef = useRef({ at: 0, key: '' });
  const lastPointRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!engine) return undefined;
    let alive = true;
    const timer = setInterval(() => {
      if (!alive) return;
      const state = useMissionStore.getState();
      if (state.mode !== 'walk' || !Number.isFinite(state.navigation.x) || !Number.isFinite(state.navigation.z) || !Number.isFinite(state.navigation.headingDeg)) {
        setWarning(null);
        setDetour(null);
        engine.setSlopeZone(null);
        zoneRef.current = { at: 0, key: '' };
        lastPointRef.current = null;
        return;
      }

      // Use the direction of travel; falling back to the look direction while standing still.
      const point = { x: state.navigation.x, z: state.navigation.z };
      const previous = lastPointRef.current;
      let bearingDeg = state.navigation.headingDeg;
      if (previous) {
        const dx = point.x - previous.x;
        const dz = point.z - previous.z;
        if (Math.hypot(dx, dz) >= MOVE_EPSILON_M) {
          bearingDeg = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
        }
      }
      lastPointRef.current = point;

      const ahead = lookAhead(point, bearingDeg, engine.slopeAt);
      if (!ahead.blocked) {
        setWarning(null);
        setDetour(null);
        setError(null);
        engine.setSlopeZone(null);
        zoneRef.current = { at: 0, key: '' };
        requestRef.current += 1;
        return;
      }

      const now = performance.now();
      if (now - zoneRef.current.at > ZONE_REFRESH_MS) {
        const cells = noGoCells(point, engine.slopeAt);
        const key = cells.map((cell) => `${cell.x},${cell.z}`).join('|') || 'empty';
        if (key !== zoneRef.current.key) {
          engine.setSlopeZone(cells);
          zoneRef.current = { at: now, key };
        } else {
          zoneRef.current.at = now;
        }
        setWarning({ maxSlopeDeg: ahead.maxSlopeDeg, distanceM: ahead.distanceM, cells, bearingDeg });
      } else {
        setWarning((current) => (current ? { ...current, maxSlopeDeg: ahead.maxSlopeDeg, distanceM: ahead.distanceM, bearingDeg } : current));
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(timer);
      requestRef.current += 1;
      engine.setSlopeZone(null);
    };
  }, [engine]);

  if (!warning) return null;

  const runDetour = () => {
    if (!engine || busy) return;
    const state = useMissionStore.getState();
    if (Object.values(state.alerts ?? {}).some((alert) => alert && alert.active)) {
      setError('An event route is active; wait for the alert to clear.');
      return;
    }
    const nextIndex = Number.isInteger(state.route.nextIndex) ? state.route.nextIndex : 0;
    const remaining = state.route.waypoints.slice(nextIndex);
    if (remaining.length === 0) {
      setError('No waypoint left to route to.');
      return;
    }
    const position = positionAlongPath(state.route.path, { x: state.navigation.x, z: state.navigation.z });
    const remainingM = position && Number.isFinite(state.route.distanceM) ? Math.max(0, state.route.distanceM - position.distanceM) : 0;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const basePath = state.route.path;
    setBusy(true);
    setError(null);
    setDetour(null);
    requestSlopeDetour({ x: state.navigation.x, z: state.navigation.z }, remaining)
      .then((result) => {
        if (requestId !== requestRef.current) return;
        if (useMissionStore.getState().route.path !== basePath) {
          setError('Route changed while planning; the detour was discarded.');
          return;
        }
        if (!result.ok) {
          setError(result.reason ?? 'No detour found.');
          return;
        }
        const extra = detourExtra(result, remainingM, ETA_SPEED_MS);
        applyPlannedRoute(useMissionStore, result, {
          reason: `Detour: steeper than ${SLOPE_NO_GO_DEG}° ahead`,
          etaSec: result.distance / ETA_SPEED_MS,
        });
        setDetour(extra);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  const mapRadius = 18;
  const cellSize = 3;
  const mapSize = 96;
  const scale = mapSize / (mapRadius * 2);
  const facing = Number.isFinite(warning.bearingDeg) ? warning.bearingDeg : 0;

  return (
    <section className="hud-slope-warning" aria-label="Slope ahead warning">
      <header>
        <strong>SLOPE AHEAD</strong>
        <span>
          {Math.round(warning.maxSlopeDeg)}° · {Math.round(warning.distanceM ?? 0)} m
          <span className="hud-src hud-src-derived" title="Slope from the HiRISE DTM, same query as the slope layer">DERIVED</span>
        </span>
      </header>
      <div className="hud-slope-body">
        <svg className="hud-slope-map" viewBox={`0 0 ${mapSize} ${mapSize}`} role="img" aria-label="No-go cells around the astronaut">
          <rect x="0" y="0" width={mapSize} height={mapSize} className="hud-slope-map-bg" />
          {warning.cells.map((cell, index) => {
            const dx = (cell.x - nav.x + mapRadius) * scale;
            const dz = (cell.z - nav.z + mapRadius) * scale;
            return <rect key={index} x={dx - cellSize * scale / 2} y={dz - cellSize * scale / 2} width={cellSize * scale} height={cellSize * scale} className="hud-slope-cell" />;
          })}
          <g transform={`translate(${mapSize / 2} ${mapSize / 2}) rotate(${facing})`}>
            <path d="M0 -6 L4 5 L0 2.5 L-4 5 Z" className="hud-slope-player" />
          </g>
        </svg>
        <div className="hud-slope-copy">
          <p>The ground ahead is over the {SLOPE_NO_GO_DEG}° limit. The zone matches the slope layer.</p>
          {detour && (
            <p className="hud-slope-detour">
              Detour +{Math.round(detour.addedM)} m · +{Math.ceil(detour.addedSec / 60)} min
              <span className="hud-src hud-src-sim" title="Time assumes the SIM walking speed, mobility.speed.flat 1 m/s">SIM</span>
            </p>
          )}
          {error && <p className="hud-slope-error" role="alert">{error}</p>}
          <button type="button" onClick={runDetour} disabled={busy || eventActive}>
            {busy ? 'Planning…' : eventActive ? 'Event route active' : 'Detour'}
          </button>
        </div>
      </div>
    </section>
  );
}
