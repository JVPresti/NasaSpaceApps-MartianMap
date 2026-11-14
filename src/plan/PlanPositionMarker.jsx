import { useEffect, useRef } from 'react';
import { useMissionStore } from '../state/store.js';
import { drawPositionMarker, markerState } from '../hud/positionMarker.js';

/**
 * The astronaut's estimated position on the Plan map (#21): a marker with an
 * uncertainty ring whose radius is `navigation.errorM`, drawn on a canvas over
 * the engine's top-down view and placed with `engine.project()`.
 *
 * It checks on every animation frame so the marker stays pinned to the ground
 * while the map pans and zooms, but it only repaints when the marker moved or
 * changed, and it never renders React per frame. The drawing itself lives in
 * src/hud/positionMarker.js, shared with the HUD minimap (#60).
 *
 * @param {{ engine: { project: (x: number, z: number) => ({ x: number, y: number, inFront: boolean } | null) } | null }} props
 */
export default function PlanPositionMarker({ engine }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!engine || !ctx) return undefined;
    const toScreen = (x, z) => engine.project(x, z);
    let frame = 0;
    let painted = '';

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pxWidth = Math.round(width * dpr);
      const pxHeight = Math.round(height * dpr);
      if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
        canvas.width = pxWidth;   // resizing clears the canvas
        canvas.height = pxHeight;
        painted = null;
      }
      const marker = markerState(useMissionStore.getState().navigation, toScreen);
      const key = marker
        ? [marker.x.toFixed(1), marker.y.toFixed(1), marker.ringPx.toFixed(1), marker.headingDeg, marker.caution, marker.label].join('|')
        : '';
      if (key === painted) return;
      painted = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (marker) drawPositionMarker(ctx, marker);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  return <canvas ref={canvasRef} className="plan-position" aria-hidden="true" />;
}
