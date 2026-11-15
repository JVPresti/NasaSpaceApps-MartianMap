// The return zone on the helmet minimap (minimapDraw.js): drawn right over the photo with the photo's own transform
// (centred on the astronaut, heading up when the heading is known), so the zone turns and scales with the map.
import { ZONE_PALETTE_HUD, drawZoneWorld } from './zonePaint.js';

/**
 * @param {CanvasRenderingContext2D} g
 * @param {{ zone?: object | null, centre: { x: number, z: number }, headingDeg?: number | null }} view
 * @param {number} cx canvas centre, px
 * @param {number} cy
 * @param {number} scale px per metre
 */
export function drawMinimapZone(g, view, cx, cy, scale) {
  if (!view.zone) return;
  g.save();
  g.translate(cx, cy);
  g.rotate(-(Number.isFinite(view.headingDeg) ? view.headingDeg : 0) * Math.PI / 180);
  g.scale(scale, scale);
  g.translate(-view.centre.x, -view.centre.z);
  drawZoneWorld(g, view.zone, ZONE_PALETTE_HUD);
  g.restore();
}
