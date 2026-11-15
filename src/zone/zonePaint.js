// Drawing the return zone (src/sim/returnZone.js) on a 2D canvas: the mission table layer, the helmet minimap and the
// wrist map all use these, so the zone looks the same everywhere. Orange (the app's --accent, #ff6a2b) is the edge
// band, where the margin is under 15 min; ground outside the zone is dimmed; inside stays clear.
import { zoneRgba } from '../sim/returnZone.js';

/** The app's orange, src/index.css --accent. */
export const ZONE_ORANGE = '#ff6a2b';

/** RGBA per zone state, 0 to 255. Outside: a dark veil; edge: a light orange wash; inside: clear; rim: solid orange. */
export const ZONE_PALETTE = Object.freeze({
  outside: Object.freeze([12, 7, 5, 170]),
  edge: Object.freeze([255, 106, 43, 72]),
  inside: Object.freeze([0, 0, 0, 0]),
  rim: Object.freeze([255, 106, 43, 255]),
});

const canvases = new WeakMap();

/** One pixel per zone node, cached per zone object. */
export function zoneCanvas(zone, palette = ZONE_PALETTE) {
  let byPalette = canvases.get(zone);
  if (!byPalette) { byPalette = new Map(); canvases.set(zone, byPalette); }
  if (byPalette.has(palette)) return byPalette.get(palette);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(zone.cols, zone.rows) : Object.assign(document.createElement('canvas'), { width: zone.cols, height: zone.rows });
  const g = canvas.getContext('2d');
  const image = g.createImageData(zone.cols, zone.rows);
  zoneRgba(zone, palette, image.data);
  g.putImageData(image, 0, 0);
  byPalette.set(palette, canvas);
  return canvas;
}

/**
 * Draw the zone in world metres: the caller has set the transform so that one unit is one metre, x east, z south.
 * Node (q, r) is the centre of pixel (q, r), so the image starts half a node north-west of node (0, 0).
 */
export function drawZoneWorld(g, zone, palette = ZONE_PALETTE) {
  const image = zoneCanvas(zone, palette);
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = true;
  g.drawImage(image, zone.x0 - zone.dx / 2, zone.z0 - zone.dz / 2, zone.cols * zone.dx, zone.rows * zone.dz);
  g.imageSmoothingEnabled = smooth;
}
