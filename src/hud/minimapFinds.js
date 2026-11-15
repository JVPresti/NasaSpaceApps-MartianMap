// Finds on the helmet minimap (#71). Each marked find is a diamond with its label (M01): amber while the detour is
// priced, green for go, red for no-go. An accepted find is a numbered waypoint like any other, so it gets no diamond
// on top of its number. A find beyond the map's range sits on the rim, so it never disappears from the map.
// Plain JavaScript, no React and no three.js.

const COLORS = { pricing: '#ffc56b', go: '#8fe9b8', 'no-go': '#ff6a4d', accepted: '#9fd8ee', error: '#ff6a4d' };

/** Colour key of a find in the store: its status, or its verdict once priced. Same rule as the scene markers. */
export function findColor(find) {
  if (find.status === 'accepted') return COLORS.accepted;
  if (find.status === 'priced') return find.detour?.verdict === 'no-go' ? COLORS['no-go'] : COLORS.go;
  if (find.status === 'error') return COLORS.error;
  return COLORS.pricing;
}

/**
 * Where each find goes on the map: inside the circle, or clamped to the rim.
 * @param {Array<{ x: number, z: number, label: string }>} finds store finds.list
 * @param {(x: number, z: number) => { x: number, y: number }} project world to canvas
 * @returns {Array<{ x: number, y: number, edge: boolean, label: string, color: string }>}
 */
export function findMarkers(finds, project, cx, cy, radius, marginPx = 8) {
  const out = [];
  for (const f of Array.isArray(finds) ? finds : []) {
    if (!Number.isFinite(f?.x) || !Number.isFinite(f?.z) || f.status === 'accepted') continue;
    const p = project(f.x, f.z), dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), max = radius - marginPx;
    const edge = d > max;
    out.push({ x: edge ? cx + dx / d * max : p.x, y: edge ? cy + dy / d * max : p.y, edge, label: f.label, color: findColor(f) });
  }
  return out;
}

/** Paint the finds on the minimap canvas. */
export function drawFinds(g, finds, project, cx, cy, radius) {
  const r = Math.max(4.5, radius * 0.045);
  for (const m of findMarkers(finds, project, cx, cy, radius, Math.max(8, radius * 0.08))) {
    g.save();
    g.translate(m.x, m.y);
    g.beginPath();
    g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0);
    g.closePath();
    g.fillStyle = m.color;
    g.globalAlpha = m.edge ? 0.7 : 1;
    g.fill();
    g.lineWidth = Math.max(1, r * 0.25);
    g.strokeStyle = 'rgba(20, 10, 6, 0.75)';
    g.stroke();
    if (!m.edge) {
      g.font = `700 ${Math.max(7, radius * 0.06)}px ui-monospace, Consolas, monospace`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = m.color;
      g.fillText(m.label, r + 2, 0);
    }
    g.restore();
  }
}
