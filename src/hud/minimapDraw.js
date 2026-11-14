import { t, translateText } from '../i18n/index.js';
// Canvas painter for the helmet minimap (#60). Draws the ortho photo, the route split into walked and
// remaining, waypoints, the habitat, refuges, active hazard zones, the partner (#70), a north ring and a scale bar.
// No player marker and no uncertainty ring: those belong to #21. No Plan-mode map: that is #14.
// Plain JavaScript, no React and no three.js.

import {
  MINIMAP_RANGE_M, TILE_DEPTH_M, TILE_WIDTH_M, activeHazardZones, bearingToScreenVector,
  cardinalPoints, niceScaleBar, projectToMap, splitShelters,
} from './minimapGeometry.js';
import { resampleRoute } from './minimapRoute.js';
import { drawPartner } from './minimapPartner.js';
import { drawFinds } from './minimapFinds.js';

const TAU = Math.PI * 2;
const COLORS = {
  base: '#1b110d',
  ink: '#fbf5ee',
  dim: 'rgba(251, 245, 238, 0.72)',
  route: '#ffd24a',
  walked: 'rgba(238, 231, 222, 0.55)',
  hazard: '#ff5a3c',
  shelter: '#8fe9b8',
  habitat: '#9ff5c4',
};

const font = (px, weight = 600) => `${weight} ${px}px ui-monospace, Consolas, monospace`;

/** World point -> canvas point for this draw. */
function projector(view, cx, cy, scale) {
  return (x, z) => projectToMap(x, z, {
    centreX: view.centre.x,
    centreZ: view.centre.z,
    headingDeg: Number.isFinite(view.headingDeg) ? view.headingDeg : null,
    scalePxPerM: scale,
    cx,
    cy,
  });
}

function drawPhoto(g, view, cx, cy, scale) {
  if (!view.image || view.imageState !== 'ready') return;
  g.save();
  g.translate(cx, cy);
  g.rotate(-(Number.isFinite(view.headingDeg) ? view.headingDeg : 0) * Math.PI / 180);
  g.scale(scale, scale);
  g.translate(-view.centre.x, -view.centre.z);
  g.imageSmoothingEnabled = true;
  // The photo covers the full rectangular HiRISE tile. x and z use the same metres-per-pixel, so the
  // geometry stays isotropic and the rectangular tile is not forced into a square.
  g.drawImage(view.image, -TILE_WIDTH_M / 2, -TILE_DEPTH_M / 2, TILE_WIDTH_M, TILE_DEPTH_M);
  g.restore();
}

function drawShade(g, cx, cy, radius) {
  g.fillStyle = 'rgba(24, 12, 7, 0.22)';
  g.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  const grad = g.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
  grad.addColorStop(0, 'rgba(20, 10, 6, 0)');
  grad.addColorStop(1, 'rgba(20, 10, 6, 0.42)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, radius, 0, TAU);
  g.fill();
}

// Range grid only: two subtle broken circles, not the navigation uncertainty ring from #21.
function drawRings(g, cx, cy, radius) {
  g.strokeStyle = 'rgba(255, 240, 225, 0.13)';
  g.lineWidth = 1;
  g.setLineDash([2, 4]);
  for (const frac of [1 / 3, 2 / 3]) {
    g.beginPath();
    g.arc(cx, cy, radius * frac, 0, TAU);
    g.stroke();
  }
  g.setLineDash([]);
}

function drawHazards(g, zones, project, cx, cy, radius, scale) {
  for (const zone of activeHazardZones(zones)) {
    const p = project(zone.x, zone.z);
    const r = zone.radiusM * scale;
    if (Math.hypot(p.x - cx, p.y - cy) - r > radius) continue;   // the circle does not touch the map
    g.beginPath();
    g.arc(p.x, p.y, r, 0, TAU);
    g.fillStyle = 'rgba(255, 90, 60, 0.16)';
    g.fill();
    g.strokeStyle = 'rgba(255, 90, 60, 0.9)';
    g.lineWidth = Math.max(1, radius * 0.012);
    g.stroke();
    if (r > radius * 0.08 && Math.hypot(p.x - cx, p.y - cy) < radius) {
      g.fillStyle = COLORS.hazard;
      g.font = font(Math.max(8, radius * 0.085), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('!', p.x, p.y);
    }
  }
}

/** Trace the part of a sampled route between two distances, with an interpolated start and end. */
function traceRun(g, points, fromM, toM) {
  if (toM - fromM < 0.01 || points.length < 2) return;
  let i = 0;
  while (i < points.length && points[i].len < fromM) i++;
  if (i >= points.length) return;
  if (i === 0) {
    g.moveTo(points[0].x, points[0].y);
  } else {
    const a = points[i - 1], b = points[i];
    const t = (fromM - a.len) / Math.max(1e-9, b.len - a.len);
    g.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  for (; i < points.length; i++) {
    const p = points[i];
    if (p.len <= toM) {
      g.lineTo(p.x, p.y);
      continue;
    }
    const a = points[i - 1] ?? p;
    const t = (toM - a.len) / Math.max(1e-9, p.len - a.len);
    g.lineTo(a.x + (p.x - a.x) * t, a.y + (p.y - a.y) * t);
    break;
  }
}

function strokeRoute(g, points, fromM, toM, { color, width, dash }) {
  g.beginPath();
  traceRun(g, points, fromM, toM);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.setLineDash([]);
  g.lineWidth = width + 2;
  g.strokeStyle = 'rgba(20, 10, 6, 0.62)';
  g.stroke();
  g.setLineDash(dash || []);
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
  g.setLineDash([]);
}

function drawRoute(g, view, project, radius) {
  const path = view.route?.path;
  const samples = resampleRoute(path);
  if (samples.total <= 0) return;
  const points = samples.points.map((p) => {
    const q = project(p.x, p.z);
    return { x: q.x, y: q.y, len: p.len };
  });
  const progress = view.progress;
  const walked = progress?.hasRoute ? Math.min(samples.total, Math.max(0, progress.progressM)) : 0;
  const width = Math.max(1.6, radius * 0.016);
  if (walked > 0.05) {
    strokeRoute(g, points, 0, walked, { color: COLORS.walked, width: width * 0.85, dash: [] });
  }
  if (samples.total - walked > 0.05) {
    strokeRoute(g, points, walked, samples.total, {
      color: COLORS.route,
      width,
      dash: [Math.max(4, radius * 0.045), Math.max(3, radius * 0.035)],
    });
  }
}

function drawShelters(g, view, project, radius) {
  const { habitat, refuges } = splitShelters(view.shelters);
  const icon = Math.max(5, radius * 0.045);
  const centre = project(view.centre.x, view.centre.z);
  if (habitat) {
    const p = project(habitat.x, habitat.z);
    if (Math.hypot(p.x - centre.x, p.y - centre.y) < radius - icon * 3) {
      g.save();
      g.translate(p.x, p.y);
      g.strokeStyle = COLORS.habitat;
      g.fillStyle = 'rgba(27, 17, 13, 0.78)';
      g.lineWidth = Math.max(1.2, icon * 0.28);
      g.beginPath();
      g.moveTo(0, -icon);
      g.lineTo(icon, -icon * 0.15);
      g.lineTo(icon * 0.62, -icon * 0.15);
      g.lineTo(icon * 0.62, icon * 0.8);
      g.lineTo(-icon * 0.62, icon * 0.8);
      g.lineTo(-icon * 0.62, -icon * 0.15);
      g.lineTo(-icon, -icon * 0.15);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = COLORS.habitat;
      g.font = font(Math.max(7, radius * 0.065), 700);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(t('hab'), p.x, p.y + icon * 1.2);
    }
  }
  for (const shelter of refuges) {
    const p = project(shelter.x, shelter.z);
    if (Math.hypot(p.x - centre.x, p.y - centre.y) > radius - icon * 2.4) continue;
    g.save();
    g.translate(p.x, p.y);
    g.beginPath();
    g.moveTo(0, -icon);
    g.lineTo(icon, -icon * 0.2);
    g.lineTo(icon * 0.55, icon * 0.75);
    g.lineTo(0, icon);
    g.lineTo(-icon * 0.55, icon * 0.75);
    g.lineTo(-icon, -icon * 0.2);
    g.closePath();
    g.fillStyle = 'rgba(27, 17, 13, 0.72)';
    g.fill();
    g.strokeStyle = COLORS.shelter;
    g.lineWidth = Math.max(1, icon * 0.24);
    g.stroke();
    g.restore();
    if (shelter.id) {
      g.fillStyle = COLORS.shelter;
      g.font = font(Math.max(6.5, radius * 0.055), 700);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(String(shelter.id), p.x + icon + 2, p.y + icon * 0.2);
    }
  }
}

function drawWaypoints(g, view, project, radius) {
  const list = Array.isArray(view.route?.waypoints) ? view.route.waypoints : [];
  const nextIndex = Number.isInteger(view.route?.nextIndex) ? view.route.nextIndex : 0;
  const r = Math.max(6.5, radius * 0.052);
  const centre = project(view.centre.x, view.centre.z);
  list.forEach((waypoint, index) => {
    if (!Number.isFinite(waypoint?.x) || !Number.isFinite(waypoint?.z)) return;
    const p = project(waypoint.x, waypoint.z);
    const distance = Math.hypot(p.x - centre.x, p.y - centre.y);
    // Every valid waypoint inside the circle keeps its numbered marker, including the one under the
    // centre. Only the player marker/ring belongs to #21, so nothing here stands in for the astronaut.
    if (distance > radius - r - 2) return;
    const active = index === nextIndex;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, TAU);
    g.fillStyle = active ? COLORS.route : 'rgba(251, 245, 238, 0.92)';
    g.fill();
    g.strokeStyle = 'rgba(20, 10, 6, 0.72)';
    g.lineWidth = Math.max(1, r * 0.22);
    g.stroke();
    g.fillStyle = '#1b110d';
    g.font = `700 ${Math.max(8, r * 1.15)}px system-ui, 'Segoe UI', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(index + 1), p.x, p.y + 0.5);
  });
}

function drawCardinalRing(g, cx, cy, radius, headingDeg) {
  const labelR = radius * 0.9;
  for (let k = 0; k < 8; k++) {
    const v = bearingToScreenVector(k * 45, headingDeg);
    const inner = radius * 0.945, outer = radius * 0.975;
    g.beginPath();
    g.moveTo(cx + v.x * inner, cy + v.y * inner);
    g.lineTo(cx + v.x * outer, cy + v.y * outer);
    g.strokeStyle = 'rgba(255, 240, 225, 0.5)';
    g.lineWidth = k % 2 === 0 ? 1.4 : 1;
    g.stroke();
  }
  for (const point of cardinalPoints(headingDeg, cx, cy, labelR)) {
    const north = point.label === 'N';
    g.fillStyle = north ? COLORS.route : COLORS.dim;
    g.font = font(Math.max(8, radius * (north ? 0.09 : 0.072)), north ? 700 : 600);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(translateText(point.label), point.x, point.y);
  }
}

function drawScaleBar(g, cx, cy, radius, rangeM) {
  const bar = niceScaleBar(rangeM, radius);
  if (!bar) return;
  const x = cx - radius * 0.62;
  const y = cy + radius * 0.66;
  g.setLineDash([]);
  g.strokeStyle = 'rgba(251, 245, 238, 0.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + bar.px, y);
  g.moveTo(x, y - 3);
  g.lineTo(x, y + 3);
  g.moveTo(x + bar.px, y - 3);
  g.lineTo(x + bar.px, y + 3);
  g.stroke();
  g.fillStyle = COLORS.dim;
  g.font = font(Math.max(8, radius * 0.072), 600);
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(bar.label, x + bar.px / 2, y - 4);
}

/**
 * Paint one frame of the minimap. The canvas is square and already sized to `size * dpr`.
 * @param {CanvasRenderingContext2D} g
 * @param {{
 *   size: number, dpr: number,
 *   centre: { x: number|null, z: number|null },
 *   headingDeg: number|null,
 *   rangeM?: number,
 *   image?: CanvasImageSource|null, imageState?: 'loading'|'ready'|'error',
 *   route?: { path: Array<[number, number]>|null, waypoints?: Array<object>, nextIndex?: number },
 *   progress?: object,
 *   shelters?: Array<object>, zones?: Array<object>,
 *   partner?: object|null,   crew[0]: the partner marker (#70)
 *   finds?: Array<object>,   finds.list: marked finds (#71)
 * }} view
 */
export function drawMinimap(g, view) {
  const size = Math.max(1, view.size || 1);
  const dpr = view.dpr || 1;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 1;
  const headingDeg = Number.isFinite(view.headingDeg) ? view.headingDeg : null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath();
  g.arc(cx, cy, radius, 0, TAU);
  g.clip();
  g.fillStyle = COLORS.base;
  g.fillRect(0, 0, size, size);

  const hasPosition = Number.isFinite(view.centre?.x) && Number.isFinite(view.centre?.z);
  if (!hasPosition) {
    g.fillStyle = COLORS.dim;
    g.font = font(Math.max(10, radius * 0.09), 700);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t('ui.no.fix'), cx, cy);
    g.restore();
    return;
  }

  const rangeM = view.rangeM > 0 ? view.rangeM : MINIMAP_RANGE_M;
  const scale = radius / rangeM;
  const project = projector(view, cx, cy, scale);
  drawPhoto(g, view, cx, cy, scale);
  drawShade(g, cx, cy, radius);
  drawRings(g, cx, cy, radius);
  drawHazards(g, view.zones, project, cx, cy, radius, scale);
  drawRoute(g, view, project, radius);
  drawShelters(g, view, project, radius);
  drawWaypoints(g, view, project, radius);
  drawFinds(g, view.finds, project, cx, cy, radius);
  drawPartner(g, view.partner, project, cx, cy, radius);
  drawCardinalRing(g, cx, cy, radius, headingDeg);
  drawScaleBar(g, cx, cy, radius, rangeM);
  if (headingDeg === null) {
    g.fillStyle = 'rgba(251, 245, 238, 0.55)';
    g.font = font(Math.max(7, radius * 0.06), 600);
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(t('northUp'), cx + radius * 0.55, cy + radius * 0.72);
  }
  g.restore();
}
