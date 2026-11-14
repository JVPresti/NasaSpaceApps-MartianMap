// Walker collisions (#38, plan item A13). Pure geometry on the ground plane: no three.js, so it runs in the tests.
// After the walk loop (view.js) moves the standing point:
//   1. pushOut: rocks of 0.35 m and larger, the Cheyava Falls rock and the partner push the walker out. Each is a capsule (a segment
//      plus a radius; a circle when the segment is a point), and they are solved together in a few passes, so a walker pushed out
//      of one into its neighbour (the partner shoving it against a rock) ends the frame clear of both.
//   2. habSlide: the habitat is a hard wall. A walker may stand inside one of its walk zones or outside all of its solids
//      (habitat.json walk_zones). A blocked step slides along the wall it hit instead of stopping. It runs last, so no push can
//      shove the walker through a wall. It works in habitat space, where every wall is an axis-aligned box side or a circle: the
//      reference undid the step along world x or z instead, which on the turned habitat zigzags along a wall (jitter) and crawls.
// Both results move a little when their input moves a little (no switching between alternatives), which is what keeps sliding
// along an obstacle free of jitter. Results are written into caller-owned objects: the frame loop allocates nothing.

export const WALKER_RADIUS = 0.3;   // m, the walker's body on the ground (reference: rocks.collide(eye, 0.3))
export const PARTNER_GAP = 0.9;     // m, the closest the two astronauts' centres get (reference)
export const ROCK_BLOCK_D = 0.35;   // m, rocks this size (longest side) and larger block the walker; smaller ones are stepped over

/** True if a rock of size D (its longest side, metres) blocks the walker. */
export const rockBlocks = (D) => D >= ROCK_BLOCK_D;

// ---------------------------------------------------------------- obstacles
// An obstacle list is a flat array of 5 numbers per obstacle: ax, az, bx, bz, r = every point within r of the segment a-b.

export function addCircle(out, x, z, r) { out.push(x, z, x, z, r); }

/**
 * Capsule fitted to a mesh's outline seen from above: the long side of its bounding box becomes the segment, the short side the
 * radius. Mesh space (x, z), unit scale. ext = farthest the capsule reaches from the mesh origin.
 * @param {ArrayLike<number>} p vertex positions, x y z per vertex
 */
export function footprint(p) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); }
  const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return { cx, cz, alongX: hx >= hz, half: Math.abs(hx - hz), r: Math.min(hx, hz), ext: Math.hypot(cx, cz) + Math.max(hx, hz) };
}

/**
 * Adds footprint f, placed in the world, to an obstacle list. (x, z) is where the mesh origin stands, s its scale, and (ax, az) the
 * direction its local x axis points in the world, any length (three.js rotation.y = t gives (cos t, -sin t); an instance matrix
 * gives its elements 0 and 2). Local z is then (-az, ax).
 */
export function addFootprint(out, f, x, z, s, ax, az) {
  const l = Math.hypot(ax, az) || 1, ux = ax / l, uz = az / l;
  const cx = x + s * (f.cx * ux - f.cz * uz), cz = z + s * (f.cx * uz + f.cz * ux);
  const dx = (f.alongX ? ux : -uz) * f.half * s, dz = (f.alongX ? uz : ux) * f.half * s;
  out.push(cx - dx, cz - dz, cx + dx, cz + dz, f.r * s);
}

/**
 * Pushes a walker of radius wr at p ({ x, z }, changed in place) out of every obstacle in the list. Several passes (Gauss-Seidel):
 * a walker pushed out of one obstacle can land inside its neighbour, and another sweep settles that within the frame.
 * @returns {boolean} true if the walker was moved
 */
export function pushOut(p, obs, wr, passes = 4) {
  let any = false;
  for (let k = 0; k < passes; k++) {
    let moved = false;
    for (let i = 0; i < obs.length; i += 5) {
      const ax = obs[i], az = obs[i + 1], ex = obs[i + 2] - ax, ez = obs[i + 3] - az, m = obs[i + 4] + wr, l2 = ex * ex + ez * ez;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - ax) * ex + (p.z - az) * ez) / l2)) : 0;
      const qx = ax + ex * t, qz = az + ez * t;   // closest point of the segment
      let dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d >= m) continue;
      if (d < 1e-9) { if (l2 > 0) { dx = -ez; dz = ex; d = Math.sqrt(l2); } else { dx = 1; dz = 0; d = 1; } }   // on the core: any side, the same one every frame
      p.x = qx + dx / d * m; p.z = qz + dz / d * m; moved = any = true;
    }
    if (!moved) break;
  }
  return any;
}

// ---------------------------------------------------------------- habitat
// Habitat space: x toward the airlock end, v sideways, metres from the habitat origin; floor(x) = floor height above the origin.
// Same numbers as habitat.json walk_zones (collide.test.js checks them against the file; the floors there are prose).
export const HAB_ZONES = [
  { n: 'stairs', x0: 8.23, x1: 9.95, v0: -0.5, v1: 0.5, floor: x => 1.02 * (9.95 - x) / 1.72 },
  { n: 'porch', x0: 7.25, x1: 8.23, v0: -0.6, v1: 0.6, floor: () => 1.02 },
  { n: 'hatch', x0: 6.85, x1: 7.25, v0: -0.36, v1: 0.36, floor: x => 1.10 + 0.15 * Math.min(1, Math.max(0, (x - 6.98) / 0.10)), door: true, duck: 0.42 },   // 15 cm hatch sill
  { n: 'airlock', x0: 2.80, x1: 6.85, v0: -0.5, v1: 0.8, floor: () => 1.10 },
  { n: 'inner', x0: 2.15, x1: 2.80, v0: -0.36, v1: 0.36, floor: x => 1.10 + 0.15 * Math.min(1, Math.max(0, Math.min(x - 2.12, 2.70 - x) / 0.10)), duck: 0.42 },   // 15 cm hatch sill: step over it
  { n: 'main', r: 2.2, floor: () => 1.10 },
];
export const HAB_SOLIDS = [{ r: 2.75 }, { x0: 2.5, x1: 7.25, v0: -1.45, v1: 1.45 }, { x0: -4.45, x1: -2.4, v0: -1.05, v1: 1.05 }, { x0: 7.25, x1: 9.95, v0: -0.78, v1: 0.78 }];
export const FURNITURE_MARGIN = 0.25;   // m, walker radius added to each furniture circle of layout.json (habitat.json walk_zones.furniture)
export const DOOR_OPEN = 0.8;           // the outer hatch zone is walkable once the hatch has swung this far (0..1)

const inShape = (q, x, v) => (q.r ? x * x + v * v < q.r * q.r : x >= q.x0 && x <= q.x1 && v >= q.v0 && v <= q.v1);
function inFurniture(x, v, blocks) {
  for (const b of blocks) if ((x - b.x) ** 2 + (v - b.v) ** 2 < (b.radius + FURNITURE_MARGIN) ** 2) return true;
  return false;
}

/**
 * The walk zone at habitat-space (x, v), or null. The hatch zone needs the hatch open; the main room leaves out the furniture.
 * @param {number} open how far the outer hatch has swung, 0..1 @param {{ x: number, v: number, radius: number }[]} blocks furniture circles
 */
export function habZone(x, v, open, blocks) {
  for (const q of HAB_ZONES) {
    if (!inShape(q, x, v) || (q.door && open < DOOR_OPEN) || (q.n === 'main' && inFurniture(x, v, blocks))) continue;
    return q;
  }
  return null;
}

/** A walker may stand inside a walk zone, or outside every solid (habitat.json walk_zones.rule). */
export function habCanStand(x, v, open, blocks) {
  if (habZone(x, v, open, blocks)) return true;
  for (const q of HAB_SOLIDS) if (inShape(q, x, v)) return false;
  return true;
}

const EPS = 1e-4;   // m: projected points land this far inside a zone or outside a solid, so the strict and inclusive tests agree

// closest point to (x, v) inside a walk zone -> o (boxes: clamp; the main room: inside its circle and outside the furniture,
// a few passes for the corners where two of those meet). false if no zone gave a point.
function intoZones(x, v, open, blocks, o) {
  let best = Infinity;
  for (const q of HAB_ZONES) {
    if (q.door && open < DOOR_OPEN) continue;
    let px, pv;
    if (q.r) {
      px = x; pv = v;
      for (let k = 0; k < 4; k++) {
        const d = Math.hypot(px, pv), rr = q.r - EPS; if (d > rr) { px *= rr / d; pv *= rr / d; }
        for (const b of blocks) { const m = b.radius + FURNITURE_MARGIN + EPS, dx = px - b.x, dv = pv - b.v, dd = Math.hypot(dx, dv); if (dd < m && dd > 1e-9) { px = b.x + dx / dd * m; pv = b.v + dv / dd * m; } }
      }
      if (!inShape(q, px, pv) || inFurniture(px, pv, blocks)) continue;
    } else { px = Math.min(q.x1, Math.max(q.x0, x)); pv = Math.min(q.v1, Math.max(q.v0, v)); }
    const d2 = (px - x) ** 2 + (pv - v) ** 2;
    if (d2 < best) { best = d2; o.x = px; o.v = pv; }
  }
  return best < Infinity;
}

// (x, v) pushed out of every solid -> o (circle: straight out; box: through its nearest face; a few passes for the corners)
function outOfSolids(x, v, o) {
  for (let k = 0; k < 4; k++) {
    let moved = false;
    for (const q of HAB_SOLIDS) {
      if (!inShape(q, x, v)) continue;
      if (q.r) { const d = Math.hypot(x, v); if (d > 1e-9) { x *= (q.r + EPS) / d; v *= (q.r + EPS) / d; } else x = q.r + EPS; }
      else {
        const l = x - q.x0, r = q.x1 - x, b = v - q.v0, t = q.v1 - v, m = Math.min(l, r, b, t);
        if (m === l) x = q.x0 - EPS; else if (m === r) x = q.x1 + EPS; else if (m === b) v = q.v0 - EPS; else v = q.v1 + EPS;
      }
      moved = true;
    }
    if (!moved) break;
  }
  o.x = x; o.v = v;
}

const _a = { x: 0, v: 0 }, _b = { x: 0, v: 0 };

// one short step from (x0, v0) toward (x1, v1) -> out
function step(x0, v0, x1, v1, open, blocks, out) {
  out.x = x1; out.v = v1;
  if (habCanStand(x1, v1, open, blocks)) return;
  const d2 = (px, pv) => (px - x1) ** 2 + (pv - v1) ** 2;
  if (habCanStand(x0, v0, open, blocks)) {
    // slide: the closest point to the target on the walker's own side of the wall (inside the zones, or outside the solids).
    // At a box wall that keeps the motion along the wall; at a round one it follows the curve. A corner it cannot resolve: stay.
    const ok = habZone(x0, v0, open, blocks) ? intoZones(x1, v1, open, blocks, _a) : (outOfSolids(x1, v1, _a), true);
    if (ok && habCanStand(_a.x, _a.v, open, blocks) && d2(_a.x, _a.v) <= d2(x0, v0)) { out.x = _a.x; out.v = _a.v; } else { out.x = x0; out.v = v0; }
    return;
  }
  // caught where it may not stand (the habitat was placed around it, or the hatch closed on it): the nearest place it may stand
  const okA = intoZones(x1, v1, open, blocks, _a) && habCanStand(_a.x, _a.v, open, blocks);
  outOfSolids(x1, v1, _b); const okB = habCanStand(_b.x, _b.v, open, blocks);
  if (okA && (!okB || d2(_a.x, _a.v) <= d2(_b.x, _b.v))) { out.x = _a.x; out.v = _a.v; } else if (okB) { out.x = _b.x; out.v = _b.v; }
  // neither: let it walk rather than trap it
}

// longer steps are cut into pieces this long, so a slide can never jump a wall (the thinnest, the porch rail, is 0.18 m;
// a 10 fps hitch while jogging diagonally is a 0.21 m step)
const SUBSTEP = 0.05;

/**
 * One walker step in the habitat, from (x0, v0) toward (x1, v1), habitat space; the result goes to out ({ x, v }). The walker
 * reaches the target if it may stand there; otherwise it slides along the wall it hit; in a corner it stays put.
 */
export function habSlide(x0, v0, x1, v1, open, blocks, out) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, v1 - v0) / SUBSTEP)), dx = (x1 - x0) / n, dv = (v1 - v0) / n;
  let x = x0, v = v0;
  for (let k = 0; k < n; k++) { step(x, v, x + dx, v + dv, open, blocks, out); x = out.x; v = out.v; }
  return out;
}

const _w = { x: 0, v: 0 };

/**
 * habSlide for world points. The habitat origin stands at (hx, hz), turned by yaw (three.js rotation.y; habitat space is
 * x = dx cos - dz sin, v = dx sin + dz cos). The walker steps from (x0, z0) to p ({ x, z }), which is changed in place, and left
 * exactly as it was when the step was not blocked.
 */
export function habSlideWorld(hx, hz, yaw, open, blocks, x0, z0, p) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ax = x0 - hx, az = z0 - hz, dx = p.x - hx, dz = p.z - hz;
  const bx = dx * c - dz * s, bv = dx * s + dz * c, o = habSlide(ax * c - az * s, ax * s + az * c, bx, bv, open, blocks, _w);
  if (o.x === bx && o.v === bv) return p;
  p.x = hx + o.x * c + o.v * s; p.z = hz - o.x * s + o.v * c;
  return p;
}
