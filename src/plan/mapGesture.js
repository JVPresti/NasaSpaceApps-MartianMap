import { clampCrop, zoomCrop } from './mapLayers.js';

// Pan and zoom on the mission table's flat map without a React render per input (#390). While a drag or a run of wheel
// steps lasts, the map's layers move as one CSS transform from the crop they last drew to the live crop; the view
// state (MissionMap's setView) changes once, when the drag ends or the wheel goes quiet, and only then does the
// map paint again and the overlays render.

/**
 * The CSS transform that moves a layer drawn for crop `from` to where crop `to` shows it, on a square box `px` wide.
 * Empty for no change, so the element keeps no transform at rest.
 * @param {{ x0: number, z0: number, size: number } | null} from
 * @param {{ x0: number, z0: number, size: number } | null} to
 * @param {number} px
 */
export function cropTransform(from, to, px) {
  if (!from || !to || !px) return '';
  if (from.x0 === to.x0 && from.z0 === to.z0 && from.size === to.size) return '';
  const k = from.size / to.size;
  const tx = ((from.x0 - to.x0) / to.size) * px;
  const ty = ((from.z0 - to.z0) / to.size) * px;
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(5)})`;
}

/** Two crops are the same view. */
export const sameCrop = (a, b) => Boolean(a && b && a.x0 === b.x0 && a.z0 === b.z0 && a.size === b.size);

/**
 * The gesture state of one map: a drag from a pointer and a zoom from wheel steps. It calls `preview(crop)` at most
 * once per frame while the gesture runs, and `commit(crop)` once at its end: on `up()` for a drag, and `wheelDelayMs`
 * after the last wheel step for a zoom.
 * @param {{ tile: () => { width: number, depth: number }, minSize: () => number, preview: (crop: object) => void,
 *   commit: (crop: object) => void, frame?: (fn: () => void) => number, cancelFrame?: (id: number) => void,
 *   wheelDelayMs?: number }} options
 */
export function createMapGesture({ tile, minSize, preview, commit, frame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, wheelDelayMs = 250 }) {
  let live = null;   // the crop the gesture shows now, null at rest
  let pending = 0;
  let wheelTimer = null;
  const show = () => {
    if (pending) return;
    pending = frame(() => { pending = 0; if (live) preview(live); });
  };
  const finish = () => {
    if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
    if (pending) { cancelFrame(pending); pending = 0; }
    const crop = live;
    if (crop) commit(crop);
    return crop;
  };
  return {
    /** The crop the gesture shows, or null at rest. */
    live: () => live,
    /**
     * Pointer moved during a drag that started at `start` ({ x, y, crop, width }: client pixels, the crop then and
     * the box width).
     */
    drag(start, clientX, clientY) {
      const metres = start.crop.size / start.width;
      live = clampCrop({ ...start.crop, x0: start.crop.x0 - (clientX - start.x) * metres, z0: start.crop.z0 - (clientY - start.y) * metres }, tile());
      show();
    },
    /** One wheel step about the box fraction (fx, fz), starting from the live crop or `base` at rest. */
    wheel(deltaY, fx, fz, base) {
      live = zoomCrop(live ?? base, deltaY > 0 ? 1.18 : 1 / 1.18, fx, fz, tile(), minSize());
      show();
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelTimer = null; finish(); }, wheelDelayMs);
    },
    /** The drag ended (pointer up or cancel): commit what it shows. */
    up: finish,
    /**
     * The view state now shows `crop`. The gesture is over once it reaches the live crop. A view set from elsewhere
     * while no drag or wheel run is going (a pinch, #365) also ends it, so a stale preview never covers that view.
     */
    settled(crop, dragging = false) {
      if (!live || wheelTimer) return;
      if (sameCrop(live, crop) || !dragging) live = null;
    },
    /** Drop the gesture without committing (a pinch took over, or the view was reset). */
    cancel() {
      if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
      if (pending) { cancelFrame(pending); pending = 0; }
      live = null;
    },
  };
}
