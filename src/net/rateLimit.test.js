import { describe, expect, it } from 'vitest';
import { ROOM_RATE } from './protocol.js';
import { createTokenBucket } from './rateLimit.js';

describe('token bucket', () => {
  it('allows a burst, then the refill rate', () => {
    const b = createTokenBucket(ROOM_RATE);
    const first = Array.from({ length: 35 }, () => b.take(0));
    expect(first.filter((v) => v === 'ok')).toHaveLength(30);
    expect(first.slice(30)).toEqual(['drop', 'drop', 'drop', 'drop', 'drop']);
    // 15 per second: after 200 ms there are 3 tokens
    const later = Array.from({ length: 5 }, () => b.take(200));
    expect(later).toEqual(['ok', 'ok', 'ok', 'drop', 'drop']);
  });

  it('a steady 15 per second is never dropped', () => {
    const b = createTokenBucket(ROOM_RATE);
    for (let i = 0; i < 15 * 60; i++) expect(b.take((i * 1000) / 15)).toBe('ok');
  });

  it('flags abuse after 5 s above 45 per second, and not before', () => {
    const b = createTokenBucket(ROOM_RATE);
    let at = null;
    for (let i = 0; i < 60 * 10 && at === null; i++) {
      const t = (i * 1000) / 60;
      if (b.take(t) === 'abuse') at = t;
    }
    expect(at).toBeGreaterThanOrEqual(5000);
    expect(at).toBeLessThan(6000);
  });

  it('40 per second for a minute is dropped but never abuse', () => {
    const b = createTokenBucket(ROOM_RATE);
    const verdicts = new Set();
    for (let i = 0; i < 40 * 60; i++) verdicts.add(b.take((i * 1000) / 40));
    expect([...verdicts].sort()).toEqual(['drop', 'ok']);
  });

  it('a pause resets the abuse run', () => {
    const b = createTokenBucket(ROOM_RATE);
    const flood = (from, seconds) => {
      const out = [];
      for (let i = 0; i < 60 * seconds; i++) out.push(b.take(from + (i * 1000) / 60));
      return out;
    };
    expect(flood(0, 4)).not.toContain('abuse');
    expect(flood(7000, 4)).not.toContain('abuse');
  });

  it('without the abuse rule it only drops', () => {
    const b = createTokenBucket({ perSec: 5, burst: 5 });
    const out = Array.from({ length: 500 }, (_, i) => b.take(i));
    expect(out).not.toContain('abuse');
  });
});
