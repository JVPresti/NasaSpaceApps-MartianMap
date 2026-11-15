import { useEffect, useRef, useState } from 'react';
import { drawMapPosition } from './mapLayers.js';

// The crew's position on the mission table map during the EVA (#265): the HUD's own marker with its uncertainty ring
// (src/hud/positionMarker.js, as the Plan map and the minimap draw it), on a canvas over the map, without the HUD's
// text label (mapLayers.drawMapPosition). It repaints only when the position, the view or the map's size changes; the
// position comes in as a prop, never read per frame.

/**
 * @param {{ position: { x: number, z: number, errorM?: number | null, headingDeg?: number | null, fixMode?: string | null } | null,
 *   crop: { x0: number, z0: number, size: number } }} props position: the estimate the HUD shows (store `navigation`)
 */
export default function MapPosition({ position, crop }) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);   // the canvas in CSS pixels

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => setSize({ w: canvas.clientWidth, h: canvas.clientHeight }));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    drawMapPosition(ctx, position, crop, size);
  }, [position, crop, size]);

  return <canvas ref={canvasRef} className="table-map-position" aria-hidden="true" />;
}
