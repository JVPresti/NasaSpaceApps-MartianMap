// Local advance along route.path for the minimap (#60), following the existing tracker rule in
// src/engine/routeGlow.js: resample every metre, search from 30 m behind to 60 m ahead of the current
// progress, accept at most 12 m of lateral distance, allow walking back, and reset when the route changes.
// The progress lives here only: there is no progress field in the mission store. App owns the single
// instance for the app session and the minimap re-syncs it with setPath, so the HUD unmounting in Plan
// mode does not throw the progress away.
// Plain JavaScript, no React and no three.js.

export const SAMPLE_STEP_M = 1;
export const TRACK_BACK_M = 30;
export const TRACK_AHEAD_M = 60;
export const TRACK_SIDE_M = 12;

/** True for [[x, z], ...] with at least two finite points. Same rule as routeGlow.validPath. */
export function validRoutePath(path) {
  return Array.isArray(path)
    && path.length >= 2
    && path.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** Stable content key: a new array with the same points is the same route, not a re-plan. */
export function routeSignature(path) {
  if (!validRoutePath(path)) return '';
  return path.map(([x, z]) => `${x},${z}`).join(';');
}

/**
 * Resample a route every `step` metres, exactly as routeGlow does for its glow.
 * @param {Array<[number, number]>} path
 * @param {number} [step]
 * @returns {{ points: Array<{x: number, z: number, len: number}>, total: number, step: number }}
 */
export function resampleRoute(path, step = SAMPLE_STEP_M) {
  if (!validRoutePath(path)) return { points: [], total: 0, step };
  const points = [{ x: path[0][0], z: path[0][1], len: 0 }];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 1e-6) continue;
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      points.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, len: total + d * t });
    }
    total += d;
  }
  return { points, total, step };
}

/**
 * Stateful tracker for one app session. App holds the instance and the minimap re-syncs it.
 *
 *   const tracker = createRouteProgress();
 *   tracker.setPath(route.path);                 // starts at 0, or resets when the route content changes
 *   const p = tracker.update(navigation);        // after each navigation update
 *   p.progressM, p.remainingM, p.offRoute
 */
export function createRouteProgress() {
  let samples = null;
  let signature = '';
  let walked = 0;
  let offRoute = false;

  function result() {
    if (!samples) return { hasRoute: false, progressM: null, totalM: null, remainingM: null, offRoute: false };
    return {
      hasRoute: true,
      progressM: walked,
      totalM: samples.total,
      remainingM: Math.max(0, samples.total - walked),
      offRoute,
    };
  }

  return {
    /** @param {Array<[number, number]> | null} path */
    setPath(path) {
      const next = routeSignature(path);
      if (next === signature) return;
      signature = next;
      samples = validRoutePath(path) ? resampleRoute(path) : null;
      walked = 0;
      offRoute = false;
    },

    /**
     * Match a position to the route near the current progress.
     * Off the route (more than TRACK_SIDE_M m away): keep the last progress.
     * @param {{ x: number|null, z: number|null } | null} position
     */
    update(position) {
      if (!samples || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return result();
      const { points } = samples;
      let best = -1;
      let bestD = TRACK_SIDE_M * TRACK_SIDE_M;
      // Samples are at most STEP_M apart, so this index is a safe lower bound.
      const first = Math.max(0, Math.floor((walked - TRACK_BACK_M) / samples.step));
      for (let i = first; i < points.length; i++) {
        const p = points[i];
        if (p.len > walked + TRACK_AHEAD_M) break;
        if (p.len < walked - TRACK_BACK_M) continue;
        const dx = p.x - position.x, dz = p.z - position.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        walked = points[best].len;
        offRoute = false;
      } else {
        offRoute = true;
      }
      return result();
    },

    get() {
      return result();
    },

    get samples() {
      return samples;
    },
  };
}
