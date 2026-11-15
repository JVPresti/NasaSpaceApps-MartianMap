// One gait phase shared by the first-person legs, head bob, arm swing and boot prints (#228).
//
// The Z-2 "walk" clip covers about 1 m per cycle: two 0.5 m steps over 1.2 s, so the clip is authored for
// WALK_SPEED_MS. Jogging is a deliberate retime of the same clip under a slow lope with 2 m strides (there is
// no jog clip in astronaut.json): the same phase drives the clip slower per metre and the bob bigger.
//
// The phase is distance, not time: it advances by the metres the body covers (signed forward distance, so
// walking backward plays the clip backward), wraps within one stride, and a footfall lands every half stride.
// Everything that cycles with the walk reads this one phase, so a footfall, a bounce, an arm swing and a print
// can never drift apart.
//
// Plain JavaScript, no three.js.

export const WALK_STRIDE_M = 1.0;            // the walk clip: one cycle per metre walked
export const JOG_STRIDE_M = 2.0;             // the jog lope: one cycle per 2 m
export const WALK_CLIP_SEC = 1.2;            // the clip's authored length (astronaut.json)
export const WALK_SPEED_MS = WALK_STRIDE_M / WALK_CLIP_SEC;   // ≈ 0.833 m/s: the speed the walk clip is authored for
/** The stooped walk covers about 0.3 m per cycle (0.15 m per stance, measured on the ankle bone): its authored speed. */
export const STOOP_SPEED_MS = 0.3 / WALK_CLIP_SEC;

export function createGait() {
  return { phase: 0, stride: WALK_STRIDE_M };   // phase: metres within the current stride, [0, stride)
}

/**
 * Advance the gait by the signed forward distance covered this frame (negative = backward). Returns the number
 * of footfalls crossed, so a caller can emit one print per half cycle.
 * @param {object} g gait state from createGait
 * @param {number} distanceM signed forward metres
 * @param {boolean} jog the Shift-key gait (#227): 2 m strides
 * @returns {number} footfalls this frame
 */
export function stepGait(g, distanceM, jog) {
  g.stride = jog ? JOG_STRIDE_M : WALK_STRIDE_M;
  if (distanceM === 0) return 0;
  g.phase += distanceM;
  const half = g.stride / 2;
  let n = 0;
  while (g.phase >= half) { g.phase -= half; n += 1; }
  while (g.phase < 0) { g.phase += half; n += 1; }
  return n;
}

/** Where the head is within the current step: bounce -1 at the footfall, +1 at the top; sway 0 at the footfall. */
export function bobCycle(g) {
  const f = g.phase / (g.stride / 2);   // 0..1 within the current step
  return { bounce: Math.abs(Math.sin(Math.PI * f)) * 2 - 1, sway: Math.sin(Math.PI * f) };
}

/** The arm-swing angle for the phase: one full swing per stride (2π per metre at the walk). */
export function swingPhase(g) {
  return (g.phase / g.stride) * Math.PI * 2;
}

/** The walk clip time for the phase: distance-driven, so the feet match the ground and never glide (#228). */
export function clipTime(g) {
  return (g.phase / g.stride) * WALK_CLIP_SEC;
}

/** Playback rate for a clip authored at `authoredSpeedMs` when the body moves at `speedMs` (1 = as authored). */
export function clipTimeScale(speedMs, authoredSpeedMs) {
  return authoredSpeedMs > 0 ? speedMs / authoredSpeedMs : 1;
}
