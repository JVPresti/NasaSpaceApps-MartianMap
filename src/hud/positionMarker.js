// Position marker with its uncertainty ring (#21), drawn on a 2D canvas in CSS pixels. No React, no three.js.
// Shared by the Plan map (src/plan/PlanPositionMarker.jsx) and the HUD minimap (#60): each map passes its own
// world-to-screen function, so the same marker and ring work north-up or heading-up, at any scale.
// The marker shows the estimate from `navigation` (x, z, errorM), never the true position: Mars has no navigation satellites.
import { formatNavError, needsFix } from './format.js';

export const MARKER_DOT_PX = 6;          // radius of the position dot
export const MIN_RING_PX = 11;           // the ring is never drawn inside the dot; the label gives the exact error
const SCALE_BASE_M = 10;                 // world baseline used to measure pixels per metre at the marker

const COLORS = {
  ring: '#9fd8ee', fill: 'rgba(159, 216, 238, 0.16)',
  caution: '#ffc56b', cautionFill: 'rgba(255, 197, 107, 0.2)',
  dot: '#f4fbff', edge: '#0b1a22', ink: '#f3e6d8', panel: 'rgba(20, 12, 9, 0.84)', line: 'rgba(255, 214, 170, 0.42)',
};

const finite = Number.isFinite;

/** Ring radius in CSS pixels for an error radius in metres at a map scale, never less than minPx. */
export function ringRadiusPx(errorM, pxPerMetre, minPx = MIN_RING_PX) {
  const r = finite(errorM) && errorM > 0 && finite(pxPerMetre) && pxPerMetre > 0 ? errorM * pxPerMetre : 0;
  return Math.max(minPx, r);
}

/**
 * Where and how to draw the marker, or null without an estimate or when the point is behind the camera.
 * @param {{ x: number | null, z: number | null, errorM: number | null, headingDeg?: number | null, fixMode?: string | null }} nav the store's navigation slice
 * @param {(x: number, z: number) => ({ x: number, y: number, inFront?: boolean } | null)} toScreen world metres (x east, z south) to CSS pixels
 * @param {{ northDeg?: number }} [options] direction of north on screen, clockwise from up: 0 on the north-up Plan map,
 *   minus the heading on a heading-up minimap
 * @returns {{ x: number, y: number, ringPx: number, headingDeg: number | null, caution: boolean, label: string | null } | null}
 */
export function markerState(nav, toScreen, { northDeg = 0 } = {}) {
  if (!nav || !finite(nav.x) || !finite(nav.z)) return null;
  const p = toScreen(nav.x, nav.z);
  if (!p || p.inFront === false || !finite(p.x) || !finite(p.y)) return null;
  const q = toScreen(nav.x + SCALE_BASE_M, nav.z);
  const pxPerMetre = q && finite(q.x) && finite(q.y) ? Math.hypot(q.x - p.x, q.y - p.y) / SCALE_BASE_M : 0;
  return {
    x: p.x, y: p.y,
    ringPx: ringRadiusPx(nav.errorM, pxPerMetre),
    headingDeg: finite(nav.headingDeg) ? nav.headingDeg + northDeg : null,
    caution: needsFix(nav.errorM),
    label: finite(nav.errorM) ? formatNavError(nav.errorM) + (nav.fixMode ? ' · ' + nav.fixMode : '') : null,
  };
}

function pill(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
}

/**
 * Draws the marker from markerState(): the uncertainty ring (a tinted disc with a thin edge, amber once a fix is
 * needed), a heading wedge, the dot and, unless `label: false`, the error and fix mode beside the ring.
 * @param {CanvasRenderingContext2D} ctx a context whose transform maps CSS pixels
 * @param {NonNullable<ReturnType<typeof markerState>>} m
 * @param {{ label?: boolean }} [options] a small minimap can leave the label out
 */
export function drawPositionMarker(ctx, m, { label = true } = {}) {
  const ring = m.caution ? COLORS.caution : COLORS.ring;
  ctx.save();
  ctx.beginPath(); ctx.arc(m.x, m.y, m.ringPx, 0, Math.PI * 2);
  ctx.fillStyle = m.caution ? COLORS.cautionFill : COLORS.fill; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = ring; ctx.stroke();

  if (m.headingDeg !== null) {   // a wedge just outside the dot, pointing along the heading (screen y grows downwards)
    const a = m.headingDeg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), tip = MARKER_DOT_PX + 7, base = MARKER_DOT_PX - 1, half = 5;
    ctx.beginPath();
    ctx.moveTo(m.x + dx * tip, m.y + dy * tip);
    ctx.lineTo(m.x + dx * base - dy * half, m.y + dy * base + dx * half);
    ctx.lineTo(m.x + dx * base + dy * half, m.y + dy * base - dx * half);
    ctx.closePath();
    ctx.fillStyle = ring; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COLORS.edge; ctx.stroke();
  }

  ctx.beginPath(); ctx.arc(m.x, m.y, MARKER_DOT_PX, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.dot; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = COLORS.edge; ctx.stroke();

  if (label && m.label) {
    ctx.font = '600 12px system-ui, "Segoe UI", sans-serif';
    const w = ctx.measureText(m.label).width + 16, h = 20, x = m.x + Math.max(m.ringPx, MARKER_DOT_PX + 8) + 6, y = m.y - h / 2;
    pill(ctx, x, y, w, h);
    ctx.fillStyle = COLORS.panel; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = m.caution ? COLORS.caution : COLORS.line; ctx.stroke();
    ctx.fillStyle = m.caution ? COLORS.caution : COLORS.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(m.label, x + 8, m.y + 0.5);
  }
  ctx.restore();
}
