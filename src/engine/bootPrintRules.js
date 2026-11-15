// Where boot prints go (bootPrints.js, #46). Plain JavaScript, no three.js, so it tests quickly.
//   - createStepTracker: one per walker. Feed it the walker's position every frame and it emits the prints of the steps taken.
//   - createPrintStore: one ring of prints per walker, so a busy walker never pushes out another walker's trail, and no
//     new print within MIN_GAP_M of one the same walker already left (a patrol line stays a line, not a trench).
//   - seatPrint: height and tilt of a print on the drawn terrain triangles.
// Basis: the Z-2 "walk" clip covers about 1 m per cycle, two steps (docs/marswalk-assets/README.md); jogging is the
// low-gravity lope with 2 m strides, so 1 m per step.
// Nothing here allocates per frame: positions go into typed arrays and steps go out through a callback.

export const STEP_WALK_M = 0.5;
export const STEP_JOG_M = 1.0;
export const FOOT_OFFSET_M = 0.11;   // each print sits this far left or right of the walking line
export const MIN_GAP_M = 0.15;       // a new print this close to an existing one of the same walker is skipped
// Ring sizes. The player's ring holds 20000 prints: 10 km of walking, about 2.8 h without a stop at 1 m/s
// (scripts/eva-prints.mjs simulates a 2 h EVA). The partner's patrol stops adding prints once the spacing check finds
// its line full; the rest of its ring covers its walks off the patrol.
export const KEEP_PLAYER = 20000, KEEP_PARTNER = 4000;
const TELEPORT_M = 3;                // a bigger jump in one frame is a teleport: no prints along it
const MIN_MOVE_M = 0.002;

/**
 * @returns {{ track: (x: number, z: number, facingYaw: number | undefined, jog: boolean, emit: (x: number, z: number, yaw: number, side: 1 | -1) => void) => number, reset: () => void }}
 * track returns how many steps it emitted. yaw: the way the toe points, in radians, 0 = north (-z), clockwise positive
 * (the same convention as view.yaw). Feet point the way the walker faces, not the way they move: walking backwards or
 * sideways still leaves the toes facing forward. Without facingYaw the direction of movement is used.
 * jog: the walker's gait (the player's Shift key): movement is normalised so a diagonal is never faster than
 * straight (#227), and jogging strides are longer than walking ones.
 */
export function createStepTracker() {
  let started = false, lx = 0, lz = 0, travelled = 0, side = 1;
  return {
    track(x, z, facingYaw, jog, emit) {
      if (!started) { started = true; lx = x; lz = z; return 0; }
      const dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz);
      if (d > TELEPORT_M) { lx = x; lz = z; travelled = 0; return 0; }
      if (d < MIN_MOVE_M) return 0;
      const step = jog ? STEP_JOG_M : STEP_WALK_M;
      const yaw = Number.isFinite(facingYaw) ? facingYaw : Math.atan2(dx, -dz);
      // perpendicular to the way the walker faces, pointing right
      const rx = Math.cos(yaw), rz = Math.sin(yaw);
      let n = 0;
      travelled += d;
      while (travelled >= step) {
        travelled -= step;
        const back = travelled / d;   // where along this frame's move the step landed
        const px = x - dx * back, pz = z - dz * back;
        emit(px + rx * FOOT_OFFSET_M * side, pz + rz * FOOT_OFFSET_M * side, yaw, side);
        side = -side; n++;
      }
      lx = x; lz = z;
      return n;
    },
    reset() { started = false; travelled = 0; },
  };
}

/**
 * A ring of `capacity` prints for one walker; past it, the oldest go first. Keeps x, z, yaw and side of every print so
 * they can be placed again when the terrain mesh changes. A spatial hash finds prints closer than `minGap`.
 * @param {number} capacity
 * @param {number} [minGap]
 */
export function createPrintStore(capacity, minGap = MIN_GAP_M) {
  const x = new Float32Array(capacity), z = new Float32Array(capacity), yaw = new Float32Array(capacity), side = new Int8Array(capacity);
  // hash of cells minGap wide: head[bucket] is the first slot, nxt/prv chain the slots of one bucket, bucketOf the slot's bucket
  let buckets = 1; while (buckets < capacity * 2) buckets *= 2;
  const mask = buckets - 1, head = new Int32Array(buckets).fill(-1);
  const nxt = new Int32Array(capacity), prv = new Int32Array(capacity), bucketOf = new Int32Array(capacity);
  const gap2 = minGap * minGap, inv = 1 / minGap;
  let next = 0, count = 0;
  const bucket = (cx, cz) => (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & mask;

  function near(px, pz) {
    const cx = Math.floor(px * inv), cz = Math.floor(pz * inv);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (let s = head[bucket(cx + i, cz + j)]; s !== -1; s = nxt[s]) {
        const dx = x[s] - px, dz = z[s] - pz;
        if (dx * dx + dz * dz < gap2) return true;
      }
    }
    return false;
  }
  function unlink(s) {
    if (prv[s] !== -1) nxt[prv[s]] = nxt[s]; else head[bucketOf[s]] = nxt[s];
    if (nxt[s] !== -1) prv[nxt[s]] = prv[s];
  }

  return {
    capacity, x, z, yaw, side,
    get count() { return count; },
    /** Bytes held by this store's arrays. */
    get bytes() { return x.byteLength + z.byteLength + yaw.byteLength + side.byteLength + head.byteLength + nxt.byteLength + prv.byteLength + bucketOf.byteLength; },
    /** Adds a print and returns its slot, or -1 when the walker already left one within minGap. */
    add(px, pz, pyaw, pside) {
      if (near(px, pz)) return -1;
      const s = next;
      if (count === capacity) unlink(s);
      x[s] = px; z[s] = pz; yaw[s] = pyaw; side[s] = pside;
      const b = bucket(Math.floor(px * inv), Math.floor(pz * inv));
      bucketOf[s] = b; prv[s] = -1; nxt[s] = head[b];
      if (head[b] !== -1) prv[head[b]] = s;
      head[b] = s;
      next = (next + 1) % capacity; count = Math.min(count + 1, capacity);
      return s;
    },
    clear() { head.fill(-1); next = 0; count = 0; },
  };
}

/**
 * Seats a flat print of half size halfW x halfL on a height field drawn as triangles (terrain.meshTriH).
 * The tilt follows the heights at the four sole corners; the print then rises until its centre, corners and edge
 * midpoints are all on or above the surface, plus `lift`. Writes { y, ux, uy, uz } (centre height and unit up) into out.
 * @param {(x: number, z: number) => number} h
 * @param {{ y: number, ux: number, uy: number, uz: number }} out
 */
export function seatPrint(h, px, pz, pyaw, halfW, halfL, lift, out) {
  const fx = Math.sin(pyaw), fz = -Math.cos(pyaw), rx = Math.cos(pyaw), rz = Math.sin(pyaw);   // toe and right, unit
  const ax = fx * halfL, az = fz * halfL, bx = rx * halfW, bz = rz * halfW;
  const fr = h(px + ax + bx, pz + az + bz), fl = h(px + ax - bx, pz + az - bz);
  const br = h(px - ax + bx, pz - az + bz), bl = h(px - ax - bx, pz - az - bz);
  const sL = (fr + fl - br - bl) / (4 * halfL), sW = (fr + br - fl - bl) / (4 * halfW);   // rise per metre toward toe, right
  let y = (fr + fl + br + bl) / 4, up = 0;
  for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
    const over = h(px + ax * v + bx * u, pz + az * v + bz * u) - (y + sL * halfL * v + sW * halfW * u);
    if (over > up) up = over;
  }
  y += up + lift;
  const gx = sL * fx + sW * rx, gz = sL * fz + sW * rz, k = 1 / Math.hypot(gx, 1, gz);   // up = (-grad, 1), normalised
  out.y = y; out.ux = -gx * k; out.uy = k; out.uz = -gz * k;
  return out;
}
