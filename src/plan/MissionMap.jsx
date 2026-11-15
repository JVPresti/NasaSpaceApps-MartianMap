import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadDataFile, TERRAIN_PATH } from '../data/dataFiles.js';
import { t, translateText } from '../i18n/index.js';
import { decodeTerrain } from '../sim/costGrid.js';
import { radioShadowMask } from '../sim/radio.js';
import { mastKey } from '../sim/routeProfiles.js';
import { waypointNumber } from '../sim/waypointNumber.js';
import { useMissionStore } from '../state/store.js';
import { LAYER, MAP_MIN_SPAN_M, acrossLabel, fromMap, mapCrop, paintMap, slopeGrid, tagFlips, toMap, waypointTaskTag } from './mapLayers.js';
import { SLOPE_LIMITS, cautionDeg } from './layers.js';
import { createMapGesture, cropTransform } from './mapGesture.js';
import LayerPlaces from './LayerPlaces.jsx';
import MapPosition from './MapPosition.jsx';
import { useLayerPlaces } from './useLayerPlaces.js';
import { useSkyView } from './routeExposure.js';
import TraverseLayer, { TraverseKey } from './TraverseLayer.jsx';
import { useMapTipPlacement, usePlacedPopup } from './usePlacedPopup.js';
import ReturnZoneLayer from '../zone/ReturnZoneLayer.jsx';
import { useReturnZone, zoneFrameKey, zoneFramePoints } from '../zone/useReturnZone.js';
import { useMapPinch } from './mapPinch.js';
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
/** While a task place is being chosen, a press that moves less than this is a click on the map, not a drag. Pixels. */
const PICK_DRAG_PX = 4;
let dataRequest = null;
const radioMasks = new Map();   // by mast position: one mask for every map on the page, as the planner keeps one
// The overlays render again only when their own props change: a gesture moves them as one transform (mapGesture.js).
const TraverseOverlay = memo(TraverseLayer);
const PlacesOverlay = memo(LayerPlaces);
const ZoneOverlay = memo(ReturnZoneLayer);
const PositionOverlay = memo(MapPosition);
// The whole tile at low resolution under the exact picture, shown while a gesture moves the map past the picture's
// edge: BACKDROP_TILES x BACKDROP_TILES squares of BACKDROP_TILE px, one per idle callback (about 40 ms each).
const BACKDROP_TILES = 4;
const BACKDROP_TILE = 512;
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50));
const cancelIdle = (id) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id));

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
 * A stop's one display name (P8): "Habitat" for the first waypoint (the airlock), as the table's Stops list names it and
 * short enough for a tag at the map's edge, else the planned waypoint's `label` (the
 * stops.json name) in the interface language, as the table's Stops list words it. `name` ("WP3 · Bright Angel outcrop")
 * is only the link key; it is shown whole only for a waypoint that has no label, such as a route.json anchor.
 * The marker's number is its position in the list (waypointNumber).
 */
function markerName(waypoint, index) {
  if (index === 0) return t('table.habitat');
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
 *   flipTags: false keeps every stop tag to the right of its marker, even near the map's right edge (the debrief's
 *   review map, where a flipped tag would land on the deviation chips and the walked track)
 *   picking: a sampling task's place is being chosen (#352, src/plan/useTaskPlace.js): the map shows a crosshair, and a
 *   click (under PICK_DRAG_PX of drag; a longer drag still moves the map) or a click on a stop marker calls onPick with
 *   the point in metres ({ x, z }) instead of opening the stop's window
 * Clicking a stop opens a small window with its height, slope and the leg that reaches it.
 */
export default function MissionMap({ layer, path, waypoints, science = new Set(), title, legend = null, route = true, legs = [], onScience = null, alternatives = NO_ALTERNATIVES, routeClass = '', traverse = false, track = null, stretches = NO_ALTERNATIVES, marks = NO_ALTERNATIVES, focus = null, mast = null, minSpanM = MAP_MIN_SPAN_M, position = null, eventRoute = false, planPath = null, flipTags = true, picking = false, onPick = null }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const caution = useMissionStore((s) => cautionDeg(s.needs?.risk));
  // the plan's sampling tasks, while the goal is "Collect samples" (#352): named on their stop markers on Rocks and Outcrop
  const planTasks = useMissionStore((s) => (s.needs?.objective === 'samples' ? s.route?.tasks ?? NO_ALTERNATIVES : NO_ALTERNATIVES));
  const sky = useSkyView(layer === LAYER.EXPOSURE);
  const radio = useRadioShadow(layer === LAYER.RADIO ? data?.terrain : null, mast);
  const zone = useReturnZone(layer === LAYER.ZONE);

  useEffect(() => {
    let cancelled = false;
    loadMapData().then((value) => !cancelled && setData(value), (cause) => !cancelled && setError(cause.message));
    return () => { cancelled = true; };
  }, []);

  const tile = data ? { width: data.terrain.width, depth: data.terrain.depth } : { width: 1422.5, depth: 1500 };
  const pathPoints = useMemo(() => (path ?? []).map(([x, z]) => ({ x, z })), [path]);
  const altPoints = useMemo(() => alternatives.flatMap((a) => a.path.map(([x, z]) => ({ x, z }))), [alternatives]);
  const trackPoints = useMemo(() => (track ?? []).map(([x, z]) => ({ x, z })), [track]);
  // Pan and zoom (#390): the layers that move together, the crops they show and the gesture that moves them
  const stageRef = useRef(null);
  const backdropRef = useRef(null);
  const paintedRef = useRef(null);   // the crop the canvas shows
  const shownRef = useRef(null);     // the crop the overlays were rendered for
  const pxRef = useRef(0);           // the box width, read when a gesture starts
  const wheelRectRef = useRef(null);
  const limitsRef = useRef({ tile: { width: 1422.5, depth: 1500 }, min: 120 });
  const setViewRef = useRef(null);
  const backdropCrop = (t) => { const side = Math.max(t.width, t.depth); return { x0: -side / 2, z0: -side / 2, size: side }; };
  const applyView = () => {
    const stage = stageRef.current, canvas = canvasRef.current, backdrop = backdropRef.current;
    const target = gestureRef.current?.live() ?? shownRef.current;
    const px = pxRef.current;
    if (stage) stage.style.transform = cropTransform(shownRef.current, target, px);
    const moved = canvas ? cropTransform(paintedRef.current, target, px) : '';
    if (canvas) canvas.style.transform = moved;
    if (backdrop) {
      backdrop.style.transform = moved ? cropTransform(backdropCrop(limitsRef.current.tile), target, px) : '';
      backdrop.style.visibility = moved && backdrop.dataset.ready ? 'visible' : 'hidden';
    }
  };
  const applyRef = useRef(applyView);
  const gestureRef = useRef(null);
  gestureRef.current ??= createMapGesture({
    tile: () => limitsRef.current.tile,
    minSize: () => limitsRef.current.min,
    preview: () => applyRef.current(),
    commit: (crop) => setViewRef.current(crop),
  });
  const planPoints = useMemo(() => (eventRoute && planPath ? planPath.map(([x, z]) => ({ x, z })) : []), [eventRoute, planPath]);
  // candidate stops (Outcrop) and shelters (Exposure) are drawn where the view is; they never move the framing
  const places = useLayerPlaces(route ? layer : LAYER.IMAGE);
  const here = position && Number.isFinite(position.x) && Number.isFinite(position.z) ? position : null;
  const zoneFrame = zoneFrameKey(zone);   // the plan's zone only, in 50 m steps: a live zone never moves the view
  const zonePoints = useMemo(() => zoneFramePoints(zoneFrame), [zoneFrame]);
  const fit = useMemo(
    () => mapCrop([...waypoints, ...pathPoints, ...altPoints, ...trackPoints, ...planPoints, ...(here ? [here] : []), ...zonePoints], tile, { min: minSpanM }),
    [waypoints, pathPoints, altPoints, trackPoints, planPoints, here?.x, here?.z, minSpanM, tile.width, tile.depth, zonePoints],   // eslint-disable-line react-hooks/exhaustive-deps
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
  // the stop details open beside the stop's marker, inside the map and clear of its caption, legend and key (#380)
  const [popRef, popStyle] = usePlacedPopup(() => boxRef.current?.querySelector(`[data-stop="${open}"]`), [open, crop]);
  useMapTipPlacement(boxRef);
  const dragRef = useRef(null);
  useMapPinch(boxRef, { crop, tile, min: Math.min(120, minSpanM), setView, dragRef });   // two fingers (#365)

  // Repaint at most once per frame while zooming or dragging.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return undefined;
    const frame = requestAnimationFrame(() => {
      const context = canvas.getContext('2d');
      const image = context.createImageData(PIXELS, PIXELS);
      paintMap(image.data, PIXELS, crop, layer, { ...data, radio, sky }, { cautionDeg: caution });
      context.putImageData(image, 0, 0);
      paintedRef.current = crop;
      applyRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [data, crop, layer, radio, sky, caution]);

  // After each render: the overlays show `crop`, so their transform starts again from it, and a finished gesture ends.
  // Runs after every render on purpose (no dependency list): applyView reads refs that any render may have changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    applyRef.current = applyView;
    setViewRef.current = setView;   // stores the setter for the gesture's commit; nothing is set here
    limitsRef.current = { tile, min: Math.min(120, minSpanM) };
    if (shownRef.current !== crop) {
      shownRef.current = crop;
      gestureRef.current.settled(crop, Boolean(dragRef.current));
      if (!gestureRef.current.live()) wheelRectRef.current = null;
    }
    applyView();
  });

  // The backdrop: the whole tile, painted in squares while the page is idle, once per picture (layer and its inputs)
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop || !data) return undefined;
    delete backdrop.dataset.ready;
    const context = backdrop.getContext('2d');
    const whole = backdropCrop(tile);
    const side = whole.size / BACKDROP_TILES;
    let k = 0;
    let id = idle(function next() {
      const i = k % BACKDROP_TILES, j = Math.floor(k / BACKDROP_TILES);
      const image = context.createImageData(BACKDROP_TILE, BACKDROP_TILE);
      paintMap(image.data, BACKDROP_TILE, { x0: whole.x0 + i * side, z0: whole.z0 + j * side, size: side }, layer, { ...data, radio, sky }, { cautionDeg: caution });
      context.putImageData(image, i * BACKDROP_TILE, j * BACKDROP_TILE);
      k += 1;
      if (k < BACKDROP_TILES * BACKDROP_TILES) id = idle(next);
      else { backdrop.dataset.ready = '1'; id = 0; }
    });
    return () => { if (id) cancelIdle(id); };
  }, [data, layer, radio, sky, caution]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      // one layout read per run of wheel steps, not per step
      const rect = wheelRectRef.current ??= box.getBoundingClientRect();
      pxRef.current = rect.width;
      const fx = (event.clientX - rect.left) / rect.width, fz = (event.clientY - rect.top) / rect.height;
      gestureRef.current.wheel(event.deltaY, fx, fz, shownRef.current);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [fit, minSpanM, tile.width, tile.depth]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const width = event.currentTarget.getBoundingClientRect().width;   // the drag's one layout read
    pxRef.current = width;
    dragRef.current = { x: event.clientX, y: event.clientY, crop: gestureRef.current.live() ?? crop, width, button: event.button };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    gestureRef.current.drag(drag, event.clientX, event.clientY);   // a transform, no render (mapGesture.js)
  };
  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) gestureRef.current.up();
  };
  const resetView = () => { gestureRef.current.cancel(); setView(null); };
  // While a task place is being chosen, a left click that hardly moved is the point (#352); a drag still moves the map.
  const onPointerUp = (event) => {
    const drag = dragRef.current;
    endDrag();
    if (!picking || !onPick || !drag || drag.button !== 0 || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= PICK_DRAG_PX) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPick(fromMap(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100, drag.crop));
  };

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
      className={picking ? 'table-map picking' : 'table-map'}
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endDrag}
      onDoubleClick={resetView}
      onContextMenu={(event) => event.preventDefault()}
    >
      <canvas ref={backdropRef} className="table-map-backdrop" width={BACKDROP_TILES * BACKDROP_TILE} height={BACKDROP_TILES * BACKDROP_TILE} aria-hidden="true" />
      <canvas ref={canvasRef} className="table-map-picture" width={PIXELS} height={PIXELS} role="img" aria-label={title} />
      <div ref={stageRef} className="table-map-stage">
      {layer === LAYER.ZONE && <ZoneOverlay zone={zone} crop={crop} />}
      {traverse && <TraverseOverlay crop={crop} withKey={false} />}
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
      <PlacesOverlay places={places} crop={crop} />
      {/* Stops as numbered markers with a label, as on the 3D plan map: HTML, so the text stays sharp at any zoom. The
          numbers are the app's one numbering (#220, src/sim/waypointNumber.js): HAB is 0 and WP1 is 1. */}
      <ol className="map-markers map-stops">
        {waypoints.map((w, k) => {
          const [u, v] = toMap(w.x, w.z, crop);
          if (u < -5 || u > 105 || v < -5 || v > 105) return null;
          if (!route && k !== 0 && k !== last) return null;
          const name = route ? markerName(w, k) : k === 0 ? t('table.habitat') : translateText(w.label ?? w.name);
          // on Rocks and Outcrop a sampling task's place says what it collects (#352), as other places on those layers do
          const taskLine = route ? waypointTaskTag(layer, w, planTasks) : null;
          const target = science.has(w.name) || k === last;
          return (
            <li key={k} className={'map-marker' + (target ? ' target' : '') + (flipTags && tagFlips(u) ? ' flip' : '')} style={{ left: `${u}%`, top: `${v}%` }}>
              <button
                type="button"
                className="map-marker-hit"
                data-stop={k}
                aria-expanded={open === k}
                aria-label={t('map.marker.details', { name: route ? `${waypointNumber(k)} ${name}` : name })}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => (picking && onPick ? onPick({ x: w.x, z: w.z }) : setOpen(open === k ? null : k))}
              >
                {route ? <span className="map-marker-num">{waypointNumber(k)}</span> : <span className={k === 0 ? 'map-marker-home' : 'map-marker-num'} />}
                <span className="map-marker-tag"><b>{name}</b>{k === shelterAt && <small className="map-tag-shelter">{t('ui.shelter.89')}</small>}{taskLine && <small>{taskLine}</small>}</span>
              </button>
            </li>
          );
        })}
        {destination && shelterAt < 0 && route && (() => {
          const [u, v] = toMap(destination.x, destination.z, crop);
          return (
            <li className={'map-place map-place-shelter map-place-event' + (flipTags && tagFlips(u) ? ' flip' : '')} style={{ left: `${u}%`, top: `${v}%` }}>
              <i aria-hidden="true" />
              <span className="map-marker-tag">{typeof eventRoute === 'object' && eventRoute?.name && <b>{eventRoute.name}</b>}<small className="map-tag-shelter">{t('ui.shelter.89')}</small></span>
            </li>
          );
        })()}
      </ol>
      {here && <PositionOverlay position={here} crop={crop} />}
      {marks.length > 0 && (
        <ul className="map-markers map-marks" aria-hidden="true">
          {marks.map((m) => {
            const [u, v] = toMap(m.x, m.z, crop);
            if (u < -5 || u > 105 || v < -5 || v > 105) return null;
            return <li key={m.id} className={m.className ? 'map-mark ' + m.className : 'map-mark'} style={{ left: `${u}%`, top: `${v}%` }} title={m.label}>{m.text ?? null}</li>;
          })}
        </ul>
      )}
      </div>
      {open !== null && waypoints[open] && (() => {
        const w = waypoints[open];
        const name = markerName(w, open);
        const fact = data ? pointFacts(data, w) : null;
        const leg = open > 0 ? legs[open - 1] : null;
        const walked = legs.slice(0, open).reduce((sum, l) => sum + (l?.distanceM ?? 0), 0);
        return (
          <div className="map-pop" ref={popRef} style={popStyle} role="dialog" aria-label={t('map.marker.details', { name })} onPointerDown={(event) => event.stopPropagation()}>
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
      {traverse && <TraverseKey />}
      {view && (
        <button type="button" className="table-map-fit" onPointerDown={(event) => event.stopPropagation()} onClick={resetView}>
          {t('map.fit.route')}
        </button>
      )}
      {error && <p className="table-map-error" role="status">{error}</p>}
    </div>
  );
}
