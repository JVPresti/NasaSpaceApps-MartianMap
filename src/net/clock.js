/**
 * Server clock offset from `t` round trips (docs/IMPLEMENTATION_PLAN.md 9.5).
 *
 * Each sample sends { type: 't', c: c0 } and reads the reply { c: c0, s } at local time c1:
 *
 *   rtt = c1 - c0        offset = s - (c0 + c1) / 2        serverNow() = now() + offset
 *
 * start() takes CLOCK.joinSamples (5) samples one after another, each sent when the previous reply arrives
 * (or after sampleTimeoutMs without one). After that it takes ONE sample every CLOCK.resyncMs (60 s). The
 * estimate is the sample with the shortest round trip among the last joinSamples samples, so an old sample
 * ages out after five minutes and a slow one never replaces a fast one in the meantime.
 */
import { CLOCK, MSG } from './protocol.js';

export function createClock({ send, now = () => Date.now(), timers = globalThis, samples = CLOCK.joinSamples, resyncMs = CLOCK.resyncMs } = {}) {
  const window = [];            // last `samples` samples: { rtt, offset }
  const pending = new Set();    // c0 values waiting for a reply
  const listeners = new Set();
  let burstLeft = 0;
  let sampleTimer = null;
  let resyncTimer = null;
  let best = null;

  function sample() {
    const c0 = now();
    pending.add(c0);
    send({ type: MSG.TIME, c: c0 });
    if (sampleTimer !== null) timers.clearTimeout(sampleTimer);
    sampleTimer = timers.setTimeout(() => { sampleTimer = null; pending.delete(c0); next(); }, CLOCK.sampleTimeoutMs);
  }

  function next() {
    if (burstLeft > 0) { burstLeft--; sample(); }
  }

  function stopTimers() {
    if (sampleTimer !== null) timers.clearTimeout(sampleTimer);
    if (resyncTimer !== null) timers.clearInterval(resyncTimer);
    sampleTimer = resyncTimer = null;
  }

  return {
    /** Starts (or restarts, after a reconnect) with a fresh burst. */
    start() {
      stopTimers();
      pending.clear();
      window.length = 0;
      burstLeft = samples;
      next();
      resyncTimer = timers.setInterval(() => { if (burstLeft === 0) { burstLeft = 1; next(); } }, resyncMs);
    },
    stop() {
      stopTimers();
      burstLeft = 0;
      pending.clear();
    },
    /** Feeds a `t` reply. Returns true when it was one of ours. */
    handle(msg) {
      if (!msg || msg.type !== MSG.TIME || typeof msg.s !== 'number' || !pending.has(msg.c)) return false;
      pending.delete(msg.c);
      const c1 = now();
      const rtt = c1 - msg.c;
      if (rtt < 0) return false;
      window.push({ rtt, offset: msg.s - (msg.c + c1) / 2 });
      while (window.length > samples) window.shift();
      best = window.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      if (sampleTimer !== null) { timers.clearTimeout(sampleTimer); sampleTimer = null; }
      for (const fn of [...listeners]) fn({ offsetMs: best.offset, rttMs: best.rtt });
      next();
      return true;
    },
    serverNow() { return now() + (best ? best.offset : 0); },
    get offsetMs() { return best ? best.offset : 0; },
    get rttMs() { return best ? best.rtt : null; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
