// The habitat route as `rt` points (#55): a planned path in metres decimated to at most MAX_ROUTE_POINTS integer
// decimetre pairs, and back. Plain JavaScript with no other imports than the protocol, so scripts/room-smoke.mjs can
// run it in Node.
import { MAX_ROUTE_POINTS } from './protocol.js';

/** Distance from p to the segment a-b. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Ramer-Douglas-Peucker with a stack (a planner path has a few thousand points). Keeps both ends. */
export function simplifyPath(path, toleranceM) {
  if (path.length <= 2) return path.slice();
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = -1, worstD = toleranceM;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(path[k], path[i], path[j]);
      if (d > worstD) { worstD = d; worst = k; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  return path.filter((_, k) => keep[k]);
}

/**
 * A planned path in metres ([[x, z], ...]) as the `rt` points: at most `max` points, integer decimetres, no repeated
 * point. The tolerance starts at 0.25 m (one step of the decimetre grid is 0.1 m) and grows until the path fits.
 * Returns null for a path with fewer than two usable points.
 */
export function routeToDecimetres(path, max = MAX_ROUTE_POINTS) {
  const clean = (Array.isArray(path) ? path : []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (clean.length < 2) return null;
  let tolerance = 0.25, simple = clean.length <= max ? clean : simplifyPath(clean, tolerance);
  while (simple.length > max) { tolerance *= 1.5; simple = simplifyPath(clean, tolerance); }
  const out = [];
  for (const [x, z] of simple) {
    const p = [Math.round(x * 10), Math.round(z * 10)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out.length >= 2 ? out : null;
}

/** `rt` points back to metres. */
export const routeToMetres = (pts) => pts.map(([x, z]) => [x / 10, z / 10]);
