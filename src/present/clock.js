// The presentation's clock and beat timeline (#291). Plain JavaScript, no DOM, no three.js.
//
// Live: each frame advances by the real frame time, capped at 0.1 s so a stall never jumps a beat.
// Recording (?record=1): each frame advances by exactly 1/60 s, whatever the real time, so a recorder that waits for
// every frame gets a perfectly smooth 60 fps video.

export const RECORD_STEP = 1 / 60;
const MAX_STEP = 0.1;

/**
 * @param {{ fixedStep?: number | null }} [options]
 */
export function createClock({ fixedStep = null } = {}) {
  let time = 0, frames = 0;
  return {
    /** Advance one frame. realDt is the real frame time in seconds; it is ignored with a fixed step. */
    tick(realDt) {
      const dt = fixedStep ?? Math.min(MAX_STEP, Math.max(0, Number(realDt) || 0));
      time += dt; frames += 1;
      return dt;
    },
    get time() { return time; },
    get frames() { return frames; },
    get fixed() { return fixedStep !== null; },
  };
}

/**
 * Which beat runs and how far into it. Advancing or going back restarts that beat from its first second. Under
 * autoplay a finished beat moves on by itself; the last beat holds.
 * @param {Array<{ id: string, duration: number }>} beats
 * @param {{ autoplay?: boolean, start?: number }} [options]
 */
export function createTimeline(beats, { autoplay = false, start = 0 } = {}) {
  if (!beats.length) throw new Error('createTimeline: no beats');
  let index = clampIndex(start), beatTime = 0, prev = Math.max(0, index - 1), done = false;
  const listeners = new Set();
  function clampIndex(i) { return Math.max(0, Math.min(beats.length - 1, i | 0)); }
  function go(i) {
    const next = clampIndex(i);
    prev = index === next ? Math.max(0, next - 1) : index; index = next; beatTime = 0; done = false;
    for (const l of listeners) l(index);
  }
  return {
    /** Advance the beat clock by dt seconds. Returns true when the beat changed. */
    advance(dt) {
      beatTime += dt;
      const beat = beats[index];
      if (beatTime >= beat.duration) {
        if (autoplay && index < beats.length - 1) { go(index + 1); return true; }
        if (index === beats.length - 1) done = true;
      }
      return false;
    },
    next() { if (index < beats.length - 1) go(index + 1); },
    back() { go(index - 1); },
    goTo(i) { go(i); },
    get index() { return index; },
    /** The beat the camera comes from: the one shown before this one. */
    get previous() { return prev; },
    get beat() { return beats[index]; },
    get beatTime() { return beatTime; },
    /** Autoplay reached the end of the last beat. */
    get done() { return done; },
    /** Seconds from the start of the first beat to the end of the last, under autoplay. */
    get total() { return beats.reduce((a, b) => a + b.duration, 0); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

/** 0 to 1 between from and to, with t clamped. */
export const ramp = (t, from, to) => (to <= from ? (t >= to ? 1 : 0) : Math.max(0, Math.min(1, (t - from) / (to - from))));
export const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const easeOut = (u) => 1 - Math.pow(1 - u, 3);

/**
 * A track value at beat time t: [from, to, startSec, endSec], eased in and out.
 * @param {[number, number, number, number]} track
 */
export function trackValue(track, t) {
  const [from, to, t0, t1] = track;
  return from + (to - from) * easeInOut(ramp(t, t0, t1));
}

/**
 * Fade for something shown from `from` to `to` seconds (to may be undefined: until the beat ends), 0.6 s in and out.
 */
export function showValue(show, t, duration) {
  const [from, to = duration + 1] = show;
  return easeOut(ramp(t, from, from + 0.6)) * (1 - ramp(t, to - 0.6, to));
}
