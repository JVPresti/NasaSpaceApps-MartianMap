// Helmet minimap (#60). App mounts it in Walk mode and owns the route tracker, so leaving Walk for
// Plan and coming back keeps the walked distance. `tracker` (required) is App's `createRouteProgress()`
// instance. It reads the store through a subscription and paints a canvas at most 10 times per second.
// React never renders per frame: store updates only ask the redraw scheduler for a frame.
import { useEffect, useRef } from 'react';
import { useMissionStore } from '../state/store.js';
import { MINIMAP_RANGE_M } from './minimapGeometry.js';
import { drawMinimap } from './minimapDraw.js';
import { createRedrawScheduler, MINIMAP_MAX_REDRAWS_PER_SECOND } from './minimapRedraw.js';
import './minimap.css';

const ORTHO_URL = import.meta.env.BASE_URL + 'marswalk/assets/ortho_lo.jpg';
const SHELTERS_URL = import.meta.env.BASE_URL + 'data/shelters.json';

function relevantState(s) {
  return {
    x: s.navigation?.x,
    z: s.navigation?.z,
    headingDeg: s.navigation?.headingDeg,
    path: s.route?.path,
    waypoints: s.route?.waypoints,
    nextIndex: s.route?.nextIndex,
    zones: s.hazards?.zones,
  };
}

function changed(prev, next) {
  return prev.x !== next.x
    || prev.z !== next.z
    || prev.headingDeg !== next.headingDeg
    || prev.path !== next.path
    || prev.waypoints !== next.waypoints
    || prev.nextIndex !== next.nextIndex
    || prev.zones !== next.zones;
}

export default function Minimap({ tracker }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !tracker) return undefined;

    let disposed = false;
    let state = useMissionStore.getState();
    let image = null;
    let imageState = 'loading';
    let shelters = [];
    let lastPath = state.route?.path;
    let lastProgress = null;
    tracker.setPath(lastPath ?? null);   // same route content on remount: keeps the progress
    let prev = relevantState(state);

    function paint() {
      // The canvas sits inside a 1 px frame: measure its own CSS box, not the wrapper.
      const cssSize = canvas.clientWidth;
      if (cssSize <= 0 || disposed) return;
      const size = Math.round(cssSize);
      const dpr = Math.min(2, window.devicePixelRatio || 1);   // read on every paint; no separate listener
      const px = Math.max(1, Math.round(size * dpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      const nav = state.navigation ?? {};
      lastProgress = tracker.update(nav);
      drawMinimap(g, {
        size,
        dpr,
        centre: { x: nav.x, z: nav.z },
        headingDeg: nav.headingDeg,
        rangeM: MINIMAP_RANGE_M,
        image,
        imageState,
        route: state.route,
        progress: lastProgress,
        shelters,
        zones: state.hazards?.zones,
      });
    }

    const scheduler = createRedrawScheduler({
      draw: ({ index, atMs, reason }) => {
        const started = performance.now();
        paint();
        if (import.meta.env.DEV) {
          canvas.dataset.drawCount = String(index);
          canvas.dataset.lastDrawAtMs = atMs.toFixed(1);
          canvas.dataset.lastDrawDurationMs = (performance.now() - started).toFixed(2);
          canvas.dataset.lastDrawReason = reason;
          canvas.dataset.redrawLimit = String(MINIMAP_MAX_REDRAWS_PER_SECOND);
          canvas.dataset.walkedM = lastProgress?.hasRoute ? lastProgress.progressM.toFixed(1) : '';
          canvas.dataset.remainingM = lastProgress?.hasRoute ? lastProgress.remainingM.toFixed(1) : '';
          canvas.dataset.offRoute = lastProgress?.hasRoute ? String(lastProgress.offRoute) : '';
        }
      },
    });

    const unsubscribe = useMissionStore.subscribe((nextState) => {
      state = nextState;
      if (nextState.route?.path !== lastPath) {
        lastPath = nextState.route?.path;
        tracker.setPath(lastPath ?? null);   // a new route content resets progress to 0
      }
      const next = relevantState(nextState);
      if (changed(prev, next)) {
        prev = next;
        scheduler.request('store');
      }
    });

    const controller = new AbortController();
    fetch(SHELTERS_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('shelters.json HTTP ' + response.status);
        return response.json();
      })
      .then((data) => {
        if (disposed) return;
        shelters = Array.isArray(data?.shelters)
          ? data.shelters.filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.z))
          : [];
        scheduler.request('shelters');
      })
      .catch(() => {
        if (disposed) return;
        shelters = [];   // no substitute data: the map simply shows no refuge markers
        scheduler.request('shelters');
      });

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (disposed) return;
      image = img;
      imageState = 'ready';
      scheduler.request('image');
    };
    img.onerror = () => {
      if (disposed) return;
      image = null;
      imageState = 'error';
      scheduler.request('image');
    };
    img.src = ORTHO_URL;

    const requestResize = () => scheduler.request('resize');
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(requestResize) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', requestResize);

    scheduler.request('mount');

    return () => {
      disposed = true;
      unsubscribe();
      controller.abort();
      ro?.disconnect();
      window.removeEventListener('resize', requestResize);
      img.onload = null;
      img.onerror = null;
      scheduler.dispose();
    };
  }, [tracker]);

  return (
    <div className="hud-map-wrap" ref={wrapRef}>
      <section className="hud-map" aria-label="Minimap">
        <canvas
          ref={canvasRef}
          className="hud-map-canvas"
          role="img"
          aria-label="Minimap centred on the astronaut"
        />
      </section>
      <div className="hud-map-legend" aria-label="Map legend">
        <span><i className="hud-map-key hud-map-key-route" />Route</span>
        <span><i className="hud-map-key hud-map-key-wp">3</i>WP</span>
        <span><i className="hud-map-key hud-map-key-shelter" />Refuge</span>
        <span><i className="hud-map-key hud-map-key-hazard" />Hazard</span>
        <span><i className="hud-map-key hud-map-key-hab" />Habitat</span>
      </div>
    </div>
  );
}
