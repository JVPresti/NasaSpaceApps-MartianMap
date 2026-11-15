import { t, subscribeLanguage } from '../i18n/index.js';
// Helmet minimap (#60). App mounts it in Walk mode and owns the route tracker, so leaving Walk for
// Plan and coming back keeps the walked distance. `tracker` (required) is App's `createRouteProgress()`
// instance. It reads the store through a subscription and paints a canvas at most 10 times per second.
// React never renders per frame: store updates only ask the redraw scheduler for a frame.
import { useEffect, useRef } from 'react';
import { useMissionStore } from '../state/store.js';
import { MINIMAP_RANGE_M } from './minimapGeometry.js';
import { drawMinimap } from './minimapDraw.js';
import { createRedrawScheduler, MINIMAP_MAX_REDRAWS_PER_SECOND } from './minimapRedraw.js';
import { truePosition } from '../sim/navigation.js';
import { loadDataFile } from '../data/dataFiles.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { loadTraverse } from '../data/traverse.js';
import './minimap.css';

const ORTHO_URL = import.meta.env.BASE_URL + 'marswalk/assets/ortho_lo.jpg';

function relevantState(s) {
  return {
    x: s.navigation?.x,
    z: s.navigation?.z,
    headingDeg: s.navigation?.headingDeg,
    path: s.route?.path,
    waypoints: s.route?.waypoints,
    nextIndex: s.route?.nextIndex,
    zones: s.hazards?.zones,
    partnerX: s.crew?.[0]?.x,
    partnerZ: s.crew?.[0]?.z,
    partnerLink: s.crew?.[0]?.link,
    finds: s.finds?.list,
  };
}

function changed(prev, next) {
  return prev.x !== next.x
    || prev.z !== next.z
    || prev.headingDeg !== next.headingDeg
    || prev.path !== next.path
    || prev.waypoints !== next.waypoints
    || prev.nextIndex !== next.nextIndex
    || prev.zones !== next.zones
    || prev.partnerX !== next.partnerX
    || prev.partnerZ !== next.partnerZ
    || prev.partnerLink !== next.partnerLink
    || prev.finds !== next.finds;
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
    let traverse = null;   // Perseverance's drives (#249), drawn under the route
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
      // Walked distance and progress come from the true position (#42): the estimate wanders and snaps, the walk does not.
      lastProgress = tracker.update(truePosition(nav));
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
        traverse,
        zones: state.hazards?.zones,
        partner: state.crew?.[0] ?? null,
        finds: state.finds?.list,
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

    const unsubscribeLanguage = subscribeLanguage(() => scheduler.request('language'));
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

    loadDataFile(SHELTERS_PATH)
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

    loadTraverse()
      .then((data) => {
        if (disposed) return;
        traverse = data;
        scheduler.request('traverse');
      })
      .catch(() => { /* no file, no line: the rest of the map is unchanged */ });

    const img = new Image();
    img.decoding = 'async';
    // Same CORS mode as three.js's TextureLoader (crossOrigin 'anonymous'), which loads this file for the Low tier.
    // Without it the browser keys the two requests apart and downloads ortho_lo.jpg twice (#205).
    img.crossOrigin = 'anonymous';
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
      unsubscribeLanguage();
      ro?.disconnect();
      window.removeEventListener('resize', requestResize);
      img.onload = null;
      img.onerror = null;
      scheduler.dispose();
    };
  }, [tracker]);

  return (
    <div className="hud-map-wrap" ref={wrapRef}>
      <section className="hud-map" aria-label={t('ui.minimap')}>
        <canvas
          ref={canvasRef}
          className="hud-map-canvas"
          role="img"
          aria-label={t('ui.minimap.centred.on.the.astronaut')}
        />
      </section>
      <div className="hud-map-legend" aria-label={t('ui.map.legend')}>
        <span><i className="hud-map-key hud-map-key-route" />{t('ui.route')}</span>
        <span><i className="hud-map-key hud-map-key-traverse" />{t('traverse.minimap')}</span>
        <span><i className="hud-map-key hud-map-key-wp">3</i>{t('ui.wp')}</span>
        <span><i className="hud-map-key hud-map-key-shelter" />{t('ui.refuge')}</span>
        <span><i className="hud-map-key hud-map-key-hazard" />{t('ui.hazard')}</span>
        <span><i className="hud-map-key hud-map-key-hab" />{t('ui.habitat')}</span>
        <span><i className="hud-map-key hud-map-key-partner" />{t('menu.partner')}</span>

      </div>
    </div>
  );
}
