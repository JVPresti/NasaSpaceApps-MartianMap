/**
 * Token bucket with an abuse rule, per socket. Pure: the caller passes the time, so tests need no timers.
 * The room uses it with ROOM_RATE (15 per second, bursts of 30); the client uses it without the abuse rule
 * for its own action cap.
 *
 * take(nowMs) returns:
 * - 'ok'    a token was available
 * - 'drop'  over the cap; the caller ignores the message
 * - 'abuse' the sender has stayed above abuseFactor x perSec for abuseMs; the room closes it with 1008
 *
 * The abuse rule counts every message, accepted or dropped, in one-second windows. A window with more than
 * abuseFactor x perSec messages is "over". Consecutive over windows that span abuseMs trigger 'abuse'. One
 * window at or under the limit, or a gap with no messages, resets the run.
 */
export function createTokenBucket({ perSec, burst, abuseFactor = 0, abuseMs = 0 }) {
  let tokens = burst;
  let last = null;
  let windowStart = null;
  let windowCount = 0;
  let overSince = null;
  const abuseLimit = abuseFactor * perSec;

  function trackAbuse(now) {
    if (!abuseLimit) return false;
    if (windowStart === null || now - windowStart >= 1000) {
      const prevOver = windowStart !== null && windowCount > abuseLimit;
      const contiguous = windowStart !== null && now - windowStart < 2000;
      if (!prevOver || !contiguous) overSince = null;
      windowStart = windowStart === null || !contiguous ? now : windowStart + 1000;
      windowCount = 0;
    }
    windowCount++;
    if (windowCount > abuseLimit && overSince === null) overSince = windowStart;
    return windowCount > abuseLimit && now - overSince >= abuseMs;
  }

  return {
    take(now) {
      if (last !== null && now > last) tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSec);
      if (last === null || now > last) last = now;
      if (trackAbuse(now)) return 'abuse';
      if (tokens >= 1) { tokens -= 1; return 'ok'; }
      return 'drop';
    },
    get tokens() { return tokens; },
  };
}
