import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDataFile, TERRAIN_PATH } from '../data/dataFiles.js';
import { decodeTerrain } from '../sim/costGrid.js';
import { waypointNumber } from '../sim/waypointNumber.js';
import { acrossLabel, clampCrop, mapCrop, paintMap, slopeGrid, toMap, zoomCrop } from './mapLayers.js';
import { SLOPE_LIMITS } from './layers.js';
import TraverseLayer from './TraverseLayer.jsx';

// Flat map of the mission table (#11). The picture is painted once per layer from the HiRISE image, the outcrop mask
// and the height grid the 3D terrain uses (terrain.json comes through the shared loader, #217, so it is the copy the
// engine and the planner already have); the route and stops are an SVG on top.
// Scroll zooms about the pointer, dragging moves the map, and Fit (or a double click) frames the whole route again.

const BASE = import.meta.env.BASE_URL + 'marswalk/assets/';
const PIXELS = 768;

let dataRequest = null;

function loadPixels(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      resolve({ w: canvas.width, h: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data });
    };
    image.onerror = () => reject(new Error(`${url} could not be loaded`));
    image.src = url;
  });
}

function loadMapData() {
  dataRequest ??= Promise.all([
    loadPixels(BASE + 'ortho_lo.jpg'),
    loadPixels(BASE + 'outcrop_mask.jpg').catch(() => null),
    loadDataFile(TERRAIN_PATH),
  ]).then(([ortho, mask, json]) => {
    const terrain = decodeTerrain(json);
    return { ortho, mask, terrain, slopes: slopeGrid(terrain) };
  });
  dataRequest.catch(() => { dataRequest = null; });
  return dataRequest;
}

/** Height above the lowest point and slope at a stop, from the nearest node of the height grid. */
function pointFacts({ terrain, slopes }, { x, z }) {
  const { n, width, depth, heights } = terrain;
  const i = Math.min(n - 1, Math.max(0, Math.round((x / width + 0.5) * (n - 1))));
  const j = Math.min(n - 1, Math.max(0, Math.round((z / depth + 0.5) * (n - 1))));
  return { height: heights[j * n + i], slope: slopes[j * n + i] };
}

/** "WP1 · channel floor" → ["WP1", "channel floor"]; the first stop is the habitat airlock. */
function markerLabel(name, index) {
  if (index === 0) return ['HAB', 'habitat airlock'];
  return name.includes(' · ') ? name.split(' · ') : [name, ''];
}

/**
 * @param {{ layer: number, path: Array<[number, number]> | null, waypoints: Array<{ name: string, x: number, z: number }>,
 *   science?: Set<string>, title: string, legend?: import('react').ReactNode }} props
 *   science: waypoint names with a science stop, their markers drawn in the route colour
 *   route: false shows only the start and the target (the Site step), without the route or the stops between
 *   legs: route.legs, for the distance and time to each stop; onScience: opens a stop's science card
 *   traverse: draw Perseverance's drives and the pin of its stop images under the route (#249, TraverseLayer.jsx)
 * Clicking a stop opens a small window with its height, slope and the leg that reaches it.
 */
export default function MissionMap({ layer, path, waypoints, science = new Set(), title, legend = null, route = true, legs = [], onScience = null, traverse = false }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadMapData().then((value) => !cancelled && setData(value), (cause) => !cancelled && setError(cause.message));
    return () => { cancelled = true; };
  }, []);

  const tile = data ? { width: data.terrain.width, depth: data.terrain.depth } : { width: 1422.5, depth: 1500 };
  const pathPoints = useMemo(() => (path ?? []).map(([x, z]) => ({ x, z })), [path]);
  const fit = useMemo(() => mapCrop([...waypoints, ...pathPoints], tile), [waypoints, pathPoints, tile.width, tile.depth]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState(null);   // null: framed on the route
  const [open, setOpen] = useState(null);   // index of the stop whose details are open
  const crop = view ?? fit;
  const boxRef = useRef(null);
  const dragRef = useRef(null);

  // Repaint at most once per frame while zooming or dragging.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return undefined;
    const frame = requestAnimationFrame(() => {
      const context = canvas.getContext('2d');
      const image = context.createImageData(PIXELS, PIXELS);
      paintMap(image.data, PIXELS, crop, layer, data);
      context.putImageData(image, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, crop, layer]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width, fz = (event.clientY - rect.top) / rect.height;
      setView((current) => zoomCrop(current ?? fit, event.deltaY > 0 ? 1.18 : 1 / 1.18, fx, fz, tile));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [fit, tile.width, tile.depth]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, crop, width: event.currentTarget.getBoundingClientRect().width };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const metres = drag.crop.size / drag.width;
    setView(clampCrop({ ...drag.crop, x0: drag.crop.x0 - (event.clientX - drag.x) * metres, z0: drag.crop.z0 - (event.clientY - drag.y) * metres }, tile));
  };
  const endDrag = () => { dragRef.current = null; };

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const line = (pathPoints.length > 1 ? pathPoints : waypoints).map((p) => toMap(p.x, p.z, crop).map((v) => v.toFixed(2)).join(',')).join(' ');
  const last = waypoints.length - 1;

  return (
    <div
      className="table-map"
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setView(null)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <canvas ref={canvasRef} width={PIXELS} height={PIXELS} role="img" aria-label={title} />
      {traverse && <TraverseLayer crop={crop} />}
      <svg className="table-map-marks" viewBox="0 0 100 100" aria-hidden="true">
        {route && line && <polyline points={line} className="map-route-shadow" />}
        {route && line && <polyline points={line} className="map-route" />}
      </svg>
      {/* Stops as numbered markers with a label, as on the 3D plan map: HTML, so the text stays sharp at any zoom. The
          numbers are the app's one numbering (#220, src/sim/waypointNumber.js): HAB is 0 and WP1 is 1. */}
      <ol className="map-markers">
        {waypoints.map((w, k) => {
          const [u, v] = toMap(w.x, w.z, crop);
          if (u < -5 || u > 105 || v < -5 || v > 105) return null;
          if (!route && k !== 0 && k !== last) return null;
          const [code, name] = route ? markerLabel(w.name, k) : [k === 0 ? 'Habitat' : w.name, ''];
          const target = science.has(w.name) || k === last;
          return (
            <li key={k} className={target ? 'map-marker target' : 'map-marker'} style={{ left: `${u}%`, top: `${v}%` }}>
              <button
                type="button"
                className="map-marker-hit"
                aria-expanded={open === k}
                aria-label={`${code}${name ? ' ' + name : ''}: details`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(open === k ? null : k)}
              >
                {route ? <span className="map-marker-num">{waypointNumber(k)}</span> : <span className={k === 0 ? 'map-marker-home' : 'map-marker-num'} />}
                <span className="map-marker-tag"><b>{code}</b>{name && <small>{name}</small>}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {open !== null && waypoints[open] && (() => {
        const w = waypoints[open];
        const [u, v] = toMap(w.x, w.z, crop);
        const [code, name] = markerLabel(w.name, open);
        const fact = data ? pointFacts(data, w) : null;
        const leg = open > 0 ? legs[open - 1] : null;
        const walked = legs.slice(0, open).reduce((sum, l) => sum + (l?.distanceM ?? 0), 0);
        const style = { left: u > 60 ? undefined : `calc(${u}% + 18px)`, right: u > 60 ? `calc(${100 - u}% + 18px)` : undefined, top: `clamp(8px, calc(${v}% - 40px), calc(100% - 260px))` };
        return (
          <div className="map-pop" style={style} role="dialog" aria-label={`${code} details`} onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-pop-head">
              <div><b>{code}</b>{name && <span>{name}</span>}</div>
              <button type="button" className="map-pop-close" aria-label="Close" onClick={() => setOpen(null)}>×</button>
            </div>
            <dl>
              <div><dt>Stop</dt><dd>{waypointNumber(open)} of {waypointNumber(last)}</dd></div>
              {fact && <div><dt>Height</dt><dd>{Math.round(fact.height)} m <small>above the lowest point</small></dd></div>}
              {fact && <div><dt>Slope here</dt><dd className={fact.slope > SLOPE_LIMITS.noGo ? 'tone-warning' : fact.slope > SLOPE_LIMITS.caution ? 'tone-caution' : undefined}>{Math.round(fact.slope)}°</dd></div>}
              {leg && <div><dt>From the last stop</dt><dd>{Math.round(leg.distanceM)} m · {Math.round(leg.timeSec / 60)} min · +{Math.round(leg.climbM)} m</dd></div>}
              {open > 0 && <div><dt>From the habitat</dt><dd>{Math.round(walked)} m walked</dd></div>}
              <div><dt>Position</dt><dd>x {Math.round(w.x)} · z {Math.round(w.z)} m</dd></div>
            </dl>
            {onScience && science.has(w.name) && (
              <button type="button" className="map-pop-science" onClick={() => { onScience(w.name); setOpen(null); }}>Open the science card</button>
            )}
          </div>
        );
      })()}
      <p className="table-map-caption">
        {title}
        <span>North up · {acrossLabel(crop.size)}</span>
      </p>
      {legend}
      {view && (
        <button type="button" className="table-map-fit" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView(null)}>
          Fit route
        </button>
      )}
      {error && <p className="table-map-error" role="status">{error}</p>}
    </div>
  );
}
