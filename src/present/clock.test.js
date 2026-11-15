import { describe, expect, it } from 'vitest';
import { RECORD_STEP, createClock, createTimeline, showValue, trackValue } from './clock.js';
import { blendShot, engineCamera, geoToLocal, localToGeo } from './geo.js';

describe('fixed-step clock', () => {
  it('advances exactly 1/60 s a frame when recording, whatever the real frame time', () => {
    const clock = createClock({ fixedStep: RECORD_STEP });
    for (const real of [0.001, 0.5, 3, 0]) expect(clock.tick(real)).toBe(RECORD_STEP);
    for (let i = 0; i < 356; i++) clock.tick(Math.random());
    expect(clock.frames).toBe(360);
    expect(clock.time).toBeCloseTo(6, 9);
  });

  it('follows real time live, capped at 0.1 s so a stall never skips a beat', () => {
    const clock = createClock();
    expect(clock.tick(0.016)).toBeCloseTo(0.016);
    expect(clock.tick(2)).toBe(0.1);
    expect(clock.tick(-1)).toBe(0);
    expect(clock.tick(Number.NaN)).toBe(0);
  });

  it('records a 9 s beat in exactly 540 frames', () => {
    const clock = createClock({ fixedStep: RECORD_STEP });
    const tl = createTimeline([{ id: 'a', duration: 9 }, { id: 'b', duration: 1 }], { autoplay: true });
    let frames = 0;
    while (tl.index === 0) { tl.advance(clock.tick(1)); frames++; }
    expect(frames).toBe(540);
  });
});

describe('beat timeline', () => {
  const beats = [{ id: 'a', duration: 2 }, { id: 'b', duration: 3 }, { id: 'c', duration: 1 }];

  it('holds a finished beat until the presenter advances', () => {
    const tl = createTimeline(beats);
    expect(tl.advance(5)).toBe(false);
    expect(tl.index).toBe(0);
    tl.next();
    expect(tl.index).toBe(1);
    expect(tl.beatTime).toBe(0);
    expect(tl.previous).toBe(0);
  });

  it('moves on by itself under autoplay and stops at the last beat', () => {
    const tl = createTimeline(beats, { autoplay: true });
    const seen = [];
    tl.onChange((i) => seen.push(i));
    for (let i = 0; i < 400; i++) tl.advance(1 / 60);
    expect(seen).toEqual([1, 2]);
    expect(tl.done).toBe(true);
    expect(tl.total).toBe(6);
  });

  it('goes back to the start of the previous beat and never below the first', () => {
    const tl = createTimeline(beats, { start: 2 });
    tl.back();
    expect(tl.index).toBe(1);
    tl.back(); tl.back();
    expect(tl.index).toBe(0);
    tl.next(); tl.next(); tl.next();
    expect(tl.index).toBe(2);
  });
});

describe('tracks and fades', () => {
  it('eases a track between its times and clamps outside them', () => {
    const tr = [0, 100, 2, 4];
    expect(trackValue(tr, 0)).toBe(0);
    expect(trackValue(tr, 3)).toBeCloseTo(50);
    expect(trackValue(tr, 9)).toBe(100);
  });

  it('plays track segments in turn', () => {
    const tr = [[0, 29, 1, 6], [29, 31, 6.5, 7]];
    expect(trackValue(tr, 0)).toBe(0);
    expect(trackValue(tr, 6.2)).toBe(29);
    expect(trackValue(tr, 8)).toBe(31);
  });

  it('fades a label in after its start and out before its end', () => {
    expect(showValue([1, 5], 0.5, 6)).toBe(0);
    expect(showValue([1, 5], 3, 6)).toBe(1);
    expect(showValue([1, 5], 5, 6)).toBe(0);
    expect(showValue([1], 6, 6)).toBe(1);
  });
});

describe('camera geometry', () => {
  it('round-trips engine metres and latitude, longitude', () => {
    const g = localToGeo(535.1, 574.1);
    const l = geoToLocal(g.lat, g.lon);
    expect(l.x).toBeCloseTo(535.1, 6);
    expect(l.z).toBeCloseTo(574.1, 6);
    expect(localToGeo(0, 0)).toEqual({ lat: 18.4975, lon: 77.3053 });
  });

  it('puts a straight-down camera right above its target', () => {
    const c = engineCamera({ ...localToGeo(100, -50), dist: 2000, yaw: 30, pitch: -90, fov: 40, targetH: 12 });
    expect(c.x).toBeCloseTo(100, 3);
    expect(c.z).toBeCloseTo(-50, 3);
    expect(c.y).toBeCloseTo(2012, 3);
  });

  it('falls in log distance on a zoom, so every scale takes the same time', () => {
    const a = { lat: 0, lon: 0, dist: 1e7, yaw: 0, pitch: -90, fov: 30 };
    const b = { ...a, dist: 1e3 };
    expect(blendShot(a, b, 0.5, { zoom: true }).dist).toBeCloseTo(1e5, 3);
    expect(blendShot(a, b, 0.5).dist).toBeCloseTo(5000500, 0);
  });

  it('turns the short way round', () => {
    const s = blendShot({ lat: 0, lon: 170, dist: 1, yaw: 350, pitch: 0, fov: 30 }, { lat: 0, lon: -170, dist: 1, yaw: 10, pitch: 0, fov: 30 }, 0.5);
    expect(Math.abs(((s.lon + 540) % 360) - 180)).toBeCloseTo(180, 6);
    expect(((s.yaw % 360) + 360) % 360).toBeCloseTo(0, 6);
  });
});
