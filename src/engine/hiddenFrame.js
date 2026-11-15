// A frame the engine does not draw because its canvas is hidden (#304). App.css hides the canvas while the opaque
// mission table covers the scene, and nobody can see a draw there, so the frame loop skips the rock update, the shadow
// pass and the draw. The systems before the check keep their time, so nothing jumps when the canvas shows again.

/**
 * The frame loop's state for a frame it does not draw, or null when it draws.
 *
 * Hidden frames count as no frames at all. The one-second window starts over, and so does the run of slow seconds
 * that triggers the automatic drop to Low, so time under the table can never add to a downgrade. The stats say
 * hidden, with 0 fps, instead of keeping the last visible second.
 *
 * @param {{ checkVisibility?: (options: object) => boolean } | null} canvas the renderer's canvas
 * @param {boolean} drawnOnce the first frame is drawn (engine.ready waits for it, so it is never skipped)
 * @returns {{ frames: 0, acc: 0, worst: 0, slowWindows: 0, stats: { fps: 0, worstMs: 0, hidden: true } } | null}
 */
export function hiddenFrame(canvas, drawnOnce) {
  if (!drawnOnce || canvas?.checkVisibility?.({ visibilityProperty: true }) !== false) return null;
  return { frames: 0, acc: 0, worst: 0, slowWindows: 0, stats: { fps: 0, worstMs: 0, hidden: true } };
}
