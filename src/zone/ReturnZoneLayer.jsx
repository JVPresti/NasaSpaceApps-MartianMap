import { useEffect, useRef } from 'react';
import { drawZoneWorld } from './zonePaint.js';
import './zone.css';

// The return zone on the mission table map (src/sim/returnZone.js through the zone service): a canvas over the map's
// own picture, drawn for the map's current view. What bounds it is written in its legend (ZoneLegendLine.jsx).

const PIXELS = 768;   // the table map's canvas (MissionMap.jsx)
/**
 * @param {{ zone: object | null, crop: { x0: number, z0: number, size: number } }} props zone: useReturnZone();
 *   crop: the map's view, as in MissionMap
 */
export default function ReturnZoneLayer({ zone, crop }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const frame = requestAnimationFrame(() => {
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, PIXELS, PIXELS);
      if (!zone) return;
      const k = PIXELS / crop.size;
      g.setTransform(k, 0, 0, k, -crop.x0 * k, -crop.z0 * k);
      drawZoneWorld(g, zone);
    });
    return () => cancelAnimationFrame(frame);
  }, [zone, crop.x0, crop.z0, crop.size]);
  return <canvas ref={ref} className="zone-layer" width={PIXELS} height={PIXELS} aria-hidden="true" />;
}
