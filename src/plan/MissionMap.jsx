import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDataFile, TERRAIN_PATH } from '../data/dataFiles.js';
import { t, translateText } from '../i18n/index.js';
import { decodeTerrain } from '../sim/costGrid.js';
import { radioShadowMask } from '../sim/radio.js';
import { mastKey } from '../sim/routeProfiles.js';
import { waypointNumber } from '../sim/waypointNumber.js';
import { useMissionStore } from '../state/store.js';
import { LAYER, MAP_MIN_SPAN_M, acrossLabel, clampCrop, mapCrop, paintMap, slopeGrid, tagFlips, toMap, zoomCrop } from './mapLayers.js';
import { SLOPE_LIMITS, cautionDeg } from './layers.js';
import LayerPlaces from './LayerPlaces.jsx';
import MapPosition from './MapPosition.jsx';
import { useLayerPlaces } from './useLayerPlaces.js';
import { useSkyView } from './routeExposure.js';
import TraverseLayer from './TraverseLayer.jsx';
import './mapLayers.css';

// Flat map of the mission table (#11). The picture is painted once per layer from the HiRISE image, the outcrop mask
// and the height grid the 3D terrain uses (terrain.json comes through the shared loader, #217, so it is the copy the
// engine and the planner already have); the route and stops are an SVG on top.
// Scroll zooms about the pointer, dragging moves the map, and Fit (or a double click) frames the whole route again.
// The layers are those of src/plan/layers.js: Terrain's caution band follows the crew's risk setting, Rocks reads the
// planner's density grid, Radio shadow the habitat mast's line of sight and Exposure the precomputed sky view grid.

const BASE = import.meta.env.BASE_URL + 'marswalk/assets/';
const PIXELS = 768;
const NO_ALTERNATIVES = [];
/** A stop this close to the end of an event's route is its shelter (the habitat's stop is its airlock). Metres. */
const SHELTER_SNAP_M = 8;
let dataRequest = null;
const radioMasks = new Map();   // by mast position: one mask for every map on the page, as the planner keeps one

/**
 * Where the habitat mast cannot be seen, on the planner's 10 m mask (radio.radioShadowMask), computed once per mast
 * (about 70 ms) after the layer button has painted, and only while the Radio shadow layer is shown.
 * @param {object | null} terrain the decoded height grid
 * @param {{ x: number, y?: number, z: number } | null} mast
 */
function useRadioShadow(terrain, mast) {
  const key = terrain ? mastKey(mast) : '';
  const [computed, setComputed] = useState(null);   // { key, mask }
  useEffect(() => {
    if (!key || radioMasks.has(key)) return undefined;
    const timer = setTimeout(() => {
      const mask = radioShadowMask(terrain, mast);
      radioMasks.set(key, mask);
      setComputed({ key, mask });
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return null;
  return radioMasks.get(key) ?? (computed?.key === key ? computed.mask : null);
}

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

/**
 * A stop's one display name (P8): the habitat airlock for the first waypoint, else the planned waypoint's `label` (the
 * stops.json name) in the interface language, as the table's Stops list words it. `name` ("WP3 · Bright Angel outcrop")
 * is only the link key; it is shown whole only for a waypoint that has no label, such as a route.json anchor.
 * The marker's number is its position in the list (waypointNumber).
 */
function markerName(waypoint, index) {
  if (index === 0) { const text = t('map.habitat.airlock'); return text.charAt(0).toUpperCase() + text.slice(1); }
  return translateText(waypoint.label ?? waypoint.name);
}

/**
 * @param {{ layer: number, path: Array<[number, number]> | null, waypoints: Array<{ name: string, x: number, z: number }>,
 *   science?: Set<string>, title: string, legend?: import('react').ReactNode }} props
 *   science: waypoint names with a science stop, their markers drawn in the route colour
 *   route: false shows only the start and the target (the Site step), without the route or the stops between
 *   legs: route.legs, for the distance and time to each stop; onScience: opens a stop's science card
 *   alternatives: [{ id, path }] the route profiles not in use (#245), dashed in their colours under the route;
 *   routeClass: class on the route line, for the colour of the profile in use
 *   traverse: draw Perseverance's drives and the pin of its stop images under the route (#249, TraverseLayer.jsx)
 *   track: [[x, z], ...] a walked track drawn under the route (.map-track), included in the fit (the debrief, #274)
 *   stretches: [{ id, path, className }] parts of the track drawn over it with their own class (.map-stretch)
 *   marks: [{ id, x, z, className, text?, label? }] small markers above the stops (.map-mark), label as their tooltip
 *   focus: [{ x, z }, ...] frames these points; a new array frames again, null goes back to the fit
 *   The classes of track, stretches and marks are styled by the screen that passes them (src/debrief/debrief.css).
 *   mast: the habitat mast ({ x, y, z }, engine.getHabitatMast()), for the Radio shadow layer; without it that layer
 *   leaves the image clear, as the planner has no radio-contact route without it
 *   minSpanM: the smallest side of the default framing, metres (MAP_MIN_SPAN_M by default): the fit frames the route,
 *   its stops, the alternatives, the track and the position with a margin, never tighter than this
 *   position: the crew's position during the EVA ({ x, z } and, when known, errorM, headingDeg, fixMode: the store's
 *   `navigation` estimate), drawn with the HUD's position marker and its uncertainty ring; null draws none
 *   eventRoute: the route is an event's route to a shelter (store `route.shelter` set): drawn in the caution colour, its
 *   end tagged SHELTER as on the HUD; pass the shelter entry ({ name }) instead of true to name a shelter that is not a
 *   stop. planPath: [[x, z], ...] the approved plan, drawn thin in the plan colour under an event route
 * Clicking a stop opens a small window with its height, slope and the leg that reaches it.
 */
export default function MissionMap({ layer, path, waypoints, science = new Set(), title, legend = null, route = true, legs = [], onScience = null, alternatives = NO_ALTERNATIVES, routeClass = '', traverse = false, track = null, stretches = NO_ALTERNATIVES, marks = NO_ALTERNATIVES, focus = null, mast = null, minSpanM = MAP_MIN_SPAN_M, position = null, eventRoute = false, planPath = null }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const caution = useMissionStore((s) => cautionDeg(s.needs?.risk));
  const sky = useSkyView(layer === LAYER.EXPOSURE);
  const radio = useRadioShadow(layer === LAYER.RADIO ? data?.terrain : null, mast);

  useEffect(() => {
    let cancelled = false;
    loadMapData().then((value) => !cancelled && setData(value), (cause) => !cancelled && setError(cause.message));
    return () => { cancelled = true; };
  }, []);

  const tile = data ? { width: data.terrain.width, depth: data.terrain.depth } : { width: 1422.5, depth: 1500 };
  const pathPoints = useMemo(() => (path ?? []).map(([x, z]) => ({ x, z })), [path]);
  const altPoints = useMemo(() => alternatives.flatMap((a) => a.path.map(([x, z]) => ({ x, z }))), [alternatives]);
  const trackPoints = useMemo(() => (track ?? []).map(([x, z]) => ({ x, z })), [track]);
  const planPoints = useMemo(() => (eventRoute && planPath ? planPath.map(([x, z]) => ({ x, z })) : []), [eventRoute, planPath]);
  // candidate stops (Outcrop) and shelters (Exposure) are drawn where the view is; they never move the framing
  const places = useLayerPlaces(route ? layer : LAYER.IMAGE);
  const here = position && Number.isFinite(position.x) && Number.isFinite(position.z) ? position : null;
  const fit = useMemo(
    () => mapCrop([...waypoints, ...pathPoints, ...altPoints, ...trackPoints, ...planPoints, ...(here ? [here] : [])], tile, { min: minSpanM }),
    [waypoints, pathPoints, altPoints, trackPoints, planPoints, here?.x, here?.z, minSpanM, tile.width, tile.depth],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A framed stretch is never framed wider than the map's own smallest fit (a short walk in the debrief, #274).
  const cropOn = (points) => (points?.length ? mapCrop(points, tile, { pad: 0.35, min: Math.min(200, minSpanM) }) : null);
  const [view, setView] = useState(() => cropOn(focus));   // null: framed on the route
  // A new focus frames its points (a deviation in the debrief, #274); set while rendering, as React suggests for
  // state that follows a prop, so the map never paints one frame at the old view.
  const [framed, setFramed] = useState(focus);
  if (focus !== framed) {
    setFramed(focus);
    setView(cropOn(focus));
  }
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
      paintMap(image.data, PIXELS, crop, layer, { ...data, radio, sky }, { cautionDeg: caution });
      context.putImageData(image, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, crop, layer, radio, sky, caution]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width, fz = (event.clientY - rect.top) / rect.height;
      setView((current) => zoomCrop(current ?? fit, event.deltaY > 0 ? 1.18 : 1 / 1.18, fx, fz, tile, Math.min(120, minSpanM)));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [fit, minSpanM, tile.width, tile.depth]);   // eslint-disable-line react-hooks/exhaustive-deps

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

  const toLine = (points) => points.map((p) => toMap(p.x, p.z, crop).map((v) => v.toFixed(2)).join(',')).join(' ');
  const line = toLine(pathPoints.length > 1 ? pathPoints : waypoints);
  const last = waypoints.length - 1;
  // An event's route ends at its shelter: the stop marker there, or a shelter marker of its own, says SHELTER as the HUD does.
  const destination = eventRoute && pathPoints.length > 1 ? pathPoints[pathPoints.length - 1] : null;
  const shelterAt = destination ? waypoints.findIndex((w) => Math.hypot(w.x - destination.x, w.z - destination.z) <= SHELTER_SNAP_M) : -1;
  const lineClass = eventRoute ? 'map-route map-route-event' : routeClass ? 'map-route ' + routeClass : 'map-route';

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
        {route && alternatives.map((a) => (
          <polyline key={a.id} points={toLine(a.path.map(([x, z]) => ({ x, z })))} className={'map-route-alt profile-' + a.id} />
        ))}
        {/* the track under the route, wider, so a walk on the plan still shows both lines */}
        {trackPoints.length > 1 && <polyline points={toLine(trackPoints)} className="map-track-shadow" />}
        {trackPoints.length > 1 && <polyline points={toLine(trackPoints)} className="map-track" />}
        {/* during an event, the approved plan stays visible, thin, under the route to the shelter */}
        {route && planPoints.length > 1 && <polyline points={toLine(planPoints)} className="map-route map-route-plan" />}
        {route && line && <polyline points={line} className="map-route-shadow" />}
        {route && line && <polyline points={line} className={lineClass} />}
        {stretches.map((s) => (
          <polyline key={s.id} points={toLine(s.path.map(([x, z]) => ({ x, z })))} className={s.className ? 'map-stretch ' + s.className : 'map-stretch'} />
        ))}
      </svg>
      {/* candidate stops on Outcrop and shelters on Exposure, under the route's own stop markers */}
      <LayerPlaces places={places} crop={crop} />
      {/* Stops as numbered markers with a label, as on the 3D plan map: HTML, so the text stays sharp at any zoom. The
          numbers are the app's one numbering (#220, src/sim/waypointNumber.js): HAB is 0 and WP1 is 1. */}
      <ol className="map-markers map-stops">
        {waypoints.map((w, k) => {
          const [u, v] = toMap(w.x, w.z, crop);
          if (u < -5 || u > 105 || v < -5 || v > 105) return null;
          if (!route && k !== 0 && k !== last) return null;
          const name = route ? markerName(w, k) : k === 0 ? t('table.habitat') : translateText(w.label ?? w.name);
          const target = science.has(w.name) || k === last;
          return (
            <li key={k} className={'map-marker' + (target ? ' target' : '') + (tagFlips(u) ? ' flip' : '')} style={{ left: `${u}%`, top: `${v}%` }}>
              <button
                type="button"
                className="map-marker-hit"
                aria-expanded={open === k}
                aria-label={t('map.marker.details', { name: route ? `${waypointNumber(k)} ${name}` : name })}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(open === k ? null : k)}
              >
                {route ? <span className="map-marker-num">{waypointNumber(k)}</span> : <span className={k === 0 ? 'map-marker-home' : 'map-marker-num'} />}
                <span className="map-marker-tag"><b>{name}</b>{k === shelterAt && <small className="map-tag-shelter">{t('ui.shelter.89')}</small>}</span>
              </button>
            </li>
          );
        })}
        {destination && shelterAt < 0 && route && (() => {
          const [u, v] = toMap(destination.x, destination.z, crop);
          return (
            <li className={'map-place map-place-shelter map-place-event' + (tagFlips(u) ? ' flip' : '')} style={{ left: `${u}%`, top: `${v}%` }}>
              <i aria-hidden="true" />
              <span className="map-marker-tag">{typeof eventRoute === 'object' && eventRoute?.name && <b>{eventRoute.name}</b>}<small className="map-tag-shelter">{t('ui.shelter.89')}</small></span>
            </li>
          );
        })()}
      </ol>
      {here && <MapPosition position={here} crop={crop} />}
      {marks.length > 0 && (
        <ul className="map-markers map-marks" aria-hidden="true">
          {marks.map((m) => {
            const [u, v] = toMap(m.x, m.z, crop);
            if (u < -5 || u > 105 || v < -5 || v > 105) return null;
            return <li key={m.id} className={m.className ? 'map-mark ' + m.className : 'map-mark'} style={{ left: `${u}%`, top: `${v}%` }} title={m.label}>{m.text ?? null}</li>;
          })}
        </ul>
      )}
      {open !== null && waypoints[open] && (() => {
        const w = waypoints[open];
        const [u, v] = toMap(w.x, w.z, crop);
        const name = markerName(w, open);
        const fact = data ? pointFacts(data, w) : null;
        const leg = open > 0 ? legs[open - 1] : null;
        const walked = legs.slice(0, open).reduce((sum, l) => sum + (l?.distanceM ?? 0), 0);
        const style = { left: u > 60 ? undefined : `calc(${u}% + 18px)`, right: u > 60 ? `calc(${100 - u}% + 18px)` : undefined, top: `clamp(8px, calc(${v}% - 40px), calc(100% - 260px))` };
        return (
          <div className="map-pop" style={style} role="dialog" aria-label={t('map.marker.details', { name })} onPointerDown={(event) => event.stopPropagation()}>
            <div className="map-pop-head">
              <div><b>{name}</b></div>
              <button type="button" className="map-pop-close" aria-label={t('menu.close')} onClick={() => setOpen(null)}>×</button>
            </div>
            <dl>
              <div><dt>{t('map.pop.stop')}</dt><dd>{t('map.pop.n.of.m', { n: waypointNumber(open), m: waypointNumber(last) })}</dd></div>
              {fact && <div><dt>{t('map.pop.height')}</dt><dd>{Math.round(fact.height)} m <small>{t('map.pop.above.lowest')}</small></dd></div>}
              {fact && <div><dt>{t('map.pop.slope')}</dt><dd className={fact.slope > SLOPE_LIMITS.noGo ? 'tone-warning' : fact.slope > SLOPE_LIMITS.caution ? 'tone-caution' : undefined}>{Math.round(fact.slope)}°</dd></div>}
              {leg && <div><dt>{t('map.pop.from.last')}</dt><dd>{Math.round(leg.distanceM)} m · {Math.round(leg.timeSec / 60)} min · +{Math.round(leg.climbM)} m</dd></div>}
              {open > 0 && <div><dt>{t('map.pop.from.habitat')}</dt><dd>{t('map.pop.walked', { m: Math.round(walked) })}</dd></div>}
              <div><dt>{t('map.pop.position')}</dt><dd>x {Math.round(w.x)} · z {Math.round(w.z)} m</dd></div>
            </dl>
            {onScience && science.has(w.name) && (
              <button type="button" className="map-pop-science" onClick={() => { onScience(w.name); setOpen(null); }}>{t('table.open.science.card')}</button>
            )}
          </div>
        );
      })()}
      <p className="table-map-caption">
        {title}
        <span>{t('map.north.up')} · {acrossLabel(crop.size)}{layer === LAYER.RADIO && !radio ? ` · ${t('layers.radio.waiting')}` : ''}</span>
      </p>
      {legend}
      {view && (
        <button type="button" className="table-map-fit" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView(null)}>
          {t('map.fit.route')}
        </button>
      )}
      {error && <p className="table-map-error" role="status">{error}</p>}
    </div>
  );
}
