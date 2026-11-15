// Partner on the helmet minimap (#70). A dot in the partner's suit colour at crew[0].x/z. With no radio line of sight
// (crew[0].link false) the dot is a grey dashed ring labelled LAST at the last known position, as plan section 4.2 asks. A partner beyond
// the map's range sits on the rim as a small arrow pointing toward them.
// Plain JavaScript, no React and no three.js.
import { crewCss } from './crewColor.js';

const TAU = Math.PI * 2;
const LOST = 'rgba(251, 245, 238, 0.9)';

/**
 * Where to draw the partner, or null without a partner position.
 * @param {{ x: number, z: number, link?: boolean, color?: number[], id?: string } | null | undefined} partner crew[0]
 * @param {(x: number, z: number) => { x: number, y: number }} project world to canvas
 * @param {number} cx canvas centre
 * @param {number} cy
 * @param {number} radius map radius in px
 * @param {number} [marginPx] distance kept from the rim
 * @returns {{ x: number, y: number, edge: boolean, angle: number, lost: boolean, color: string, label: string } | null}
 */
export function partnerMarker(partner, project, cx, cy, radius, marginPx = 8) {
  if (!partner || !Number.isFinite(partner.x) || !Number.isFinite(partner.z)) return null;
  const p = project(partner.x, partner.z), dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), max = radius - marginPx;
  const lost = partner.link === false;
  const base = { angle: Math.atan2(dy, dx), lost, color: lost ? LOST : crewCss(partner.color) || '#ff9a3c', label: partner.id || 'EV2' };
  if (d <= max) return { ...base, x: p.x, y: p.y, edge: false };
  return { ...base, x: cx + dx / d * max, y: cy + dy / d * max, edge: true };
}

/** Paint the partner marker on the minimap canvas. */
export function drawPartner(g, partner, project, cx, cy, radius) {
  const m = partnerMarker(partner, project, cx, cy, radius, Math.max(8, radius * 0.08));
  if (!m) return;
  const r = Math.max(4, radius * 0.04);
  g.save();
  g.lineWidth = Math.max(1.2, r * 0.38);
  if (m.edge) {
    g.translate(m.x, m.y);
    g.rotate(m.angle);
    g.beginPath();
    g.moveTo(r * 1.4, 0);
    g.lineTo(-r * 0.8, r);
    g.lineTo(-r * 0.8, -r);
    g.closePath();
    g.fillStyle = m.lost ? 'rgba(27, 17, 13, 0.7)' : m.color;
    g.strokeStyle = m.lost ? m.color : 'rgba(20, 10, 6, 0.75)';
    g.fill();
    g.stroke();
    g.restore();
    return;
  }
  g.beginPath();
  g.arc(m.x, m.y, r, 0, TAU);
  if (m.lost) {
    g.fillStyle = 'rgba(27, 17, 13, 0.75)';
    g.fill();
    g.setLineDash([2.5, 2]);
    g.strokeStyle = m.color;
    g.stroke();
    g.setLineDash([]);
  } else {
    g.fillStyle = m.color;
    g.fill();
    g.strokeStyle = 'rgba(20, 10, 6, 0.75)';
    g.stroke();
  }
  g.fillStyle = m.color;
  g.font = `700 ${Math.max(7, radius * 0.06)}px ui-monospace, Consolas, monospace`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(20, 10, 6, 0.8)';
  g.lineWidth = 3;
  const text = m.lost ? m.label + ' LAST' : m.label;
  g.strokeText(text, m.x + r + 3, m.y);
  g.fillText(text, m.x + r + 3, m.y);
  g.restore();
}
