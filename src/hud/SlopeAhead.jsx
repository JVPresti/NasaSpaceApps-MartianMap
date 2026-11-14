import { useEffect, useRef, useState } from 'react';
import { useMissionStore } from '../state/store.js';
import { requestSlopeDetour } from '../state/slopeDetour.js';
import { positionAlongPath } from './profile.js';
import { detourExtra, lookAhead, noGoCells } from '../sim/slopeAhead.js';

const ZONE_REFRESH_MS = 500;

/**
 * Slope look-ahead warning (#69): a red zone on the ground, a small map and a
 * detour button that asks the A* worker for a route around the blocked cells.
 */
export default function SlopeAhead({ engine }) {
  const nav = useMissionStore((s) => s.navigation);
  const [warning, setWarning] = useState(null);
  const [detour, setDetour] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const zoneRef = useRef({ at: 0, key: '' });

  useEffect(() => {
    if (!engine) return undefined;
    let alive = true;
    const timer = setInterval(() => {
      if (!alive) return;
      const state = useMissionStore.getState();
      if (state.mode !== 'walk' || !Number.isFinite(state.navigation.x) || !Number.isFinite(state.navigation.z) || !Number.isFinite(state.navigation.headingDeg)) {
        setWarning(null);
        engine.setSlopeZone(null);
        zoneRef.current = { at: 0, key: '' };
        return;
      }
      const ahead = lookAhead(state.navigation, state.navigation.headingDeg, engine.slopeAt);
      if (!ahead.blocked) {
        setWarning(null);
        setError(null);
        engine.setSlopeZone(null);
        zoneRef.current = { at: 0, key: '' };
        return;
      }
      const now = performance.now();
      if (now - zoneRef.current.at > ZONE_REFRESH_MS) {
        const cells = noGoCells(state.navigation, engine.slopeAt);
        const key = cells.length + ':' + cells[0]?.x.toFixed(0) + ':' + cells[0]?.z.toFixed(0);
        if (key !== zoneRef.current.key) {
          engine.setSlopeZone(cells);
          zoneRef.current = { at: now, key };
        } else {
          zoneRef.current.at = now;
        }
        setWarning({ maxSlopeDeg: ahead.maxSlopeDeg, distanceM: ahead.distanceM, cells });
      } else {
        setWarning((current) => (current ? { ...current, maxSlopeDeg: ahead.maxSlopeDeg, distanceM: ahead.distanceM } : current));
      }
    }, 250);
    return () => {
      alive = false;
      clearInterval(timer);
      engine.setSlopeZone(null);
    };
  }, [engine]);

  if (!warning) return null;

  const heading = Number.isFinite(nav.headingDeg) ? nav.headingDeg : 0;
  const runDetour = () => {
    if (!engine || busy) return;
    const state = useMissionStore.getState();
    const nextIndex = Number.isInteger(state.route.nextIndex) ? state.route.nextIndex : 0;
    const remaining = state.route.waypoints.slice(nextIndex);
    if (remaining.length === 0) {
      setError('No waypoint left to route to.');
      return;
    }
    const position = positionAlongPath(state.route.path, { x: state.navigation.x, z: state.navigation.z });
    const remainingM = position && Number.isFinite(state.route.distanceM) ? Math.max(0, state.route.distanceM - position.distanceM) : 0;
    setBusy(true);
    setError(null);
    requestSlopeDetour({ x: state.navigation.x, z: state.navigation.z }, remaining)
      .then((result) => {
        if (!result.ok) {
          setError(result.reason ?? 'No detour found.');
          return;
        }
        const extra = detourExtra(result, remainingM);
        useMissionStore.setState((current) => ({
          route: {
            ...current.route,
            path: result.path,
            distanceM: result.distance,
            climbM: result.climb,
            steepestSlopeDeg: result.steepestSlopeDeg,
            etaSec: result.distance,
            reason: 'Detour: steeper than 25° ahead',
            decision: 'pending',
            skipped: [],
          },
          sources: {
            ...current.sources,
            'route.path': { tag: 'DERIVED', source: 'A* planner · HiRISE DTM' },
            'route.reason': { tag: 'DERIVED', source: 'A* planner · slope limit 25°' },
          },
        }));
        setDetour(extra);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  const mapRadius = 18;
  const cellSize = 3;
  const mapSize = 96;
  const scale = mapSize / (mapRadius * 2);

  return (
    <section className="hud-slope-warning" aria-label="Slope ahead warning">
      <header>
        <strong>SLOPE AHEAD</strong>
        <span>{Math.round(warning.maxSlopeDeg)}° · {Math.round(warning.distanceM ?? 0)} m</span>
      </header>
      <div className="hud-slope-body">
        <svg className="hud-slope-map" viewBox={`0 0 ${mapSize} ${mapSize}`} role="img" aria-label="No-go cells around the astronaut">
          <rect x="0" y="0" width={mapSize} height={mapSize} className="hud-slope-map-bg" />
          {warning.cells.map((cell, index) => {
            const dx = (cell.x - nav.x + mapRadius) * scale;
            const dz = (cell.z - nav.z + mapRadius) * scale;
            return <rect key={index} x={dx - cellSize * scale / 2} y={dz - cellSize * scale / 2} width={cellSize * scale} height={cellSize * scale} className="hud-slope-cell" />;
          })}
          <g transform={`translate(${mapSize / 2} ${mapSize / 2}) rotate(${heading})`}>
            <path d="M0 -6 L4 5 L0 2.5 L-4 5 Z" className="hud-slope-player" />
          </g>
        </svg>
        <div className="hud-slope-copy">
          <p>The ground ahead is over the 25° limit. The zone matches the slope layer.</p>
          {detour && <p className="hud-slope-detour">Detour +{Math.round(detour.addedM)} m · +{Math.ceil(detour.addedSec / 60)} min</p>}
          {error && <p className="hud-slope-error" role="alert">{error}</p>}
          <button type="button" onClick={runDetour} disabled={busy}>
            {busy ? 'Planning…' : 'Detour'}
          </button>
        </div>
      </div>
    </section>
  );
}
