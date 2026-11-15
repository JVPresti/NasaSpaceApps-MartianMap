import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMapGesture, cropTransform, sameCrop } from './mapGesture.js';
import { toMap } from './mapLayers.js';

const TILE = { width: 1422.5, depth: 1500 };
const START = { x0: -75, z0: -75, size: 150 };

// A frame queue standing in for requestAnimationFrame: run() fires the frames queued so far, as one browser frame.
function frames() {
  let queue = [];
  let id = 0;
  return {
    frame: (fn) => { queue.push({ id: ++id, fn }); return id; },
    cancelFrame: (n) => { queue = queue.filter((f) => f.id !== n); },
    run: () => { const now = queue; queue = []; for (const f of now) f.fn(); },
  };
}

function setup() {
  const f = frames();
  const setView = vi.fn();
  const preview = vi.fn();
  const gesture = createMapGesture({ tile: () => TILE, minSize: () => 120, preview, commit: setView, frame: f.frame, cancelFrame: f.cancelFrame });
  return { f, setView, preview, gesture };
}

describe('map pan and zoom (#390)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets the view once for a whole drag, however many pointer moves it has', () => {
    const { f, setView, preview, gesture } = setup();
    const start = { x: 500, y: 400, crop: START, width: 946 };
    for (let k = 1; k <= 120; k += 1) {
      gesture.drag(start, 500 - k * 3, 400 + k);
      if (k % 2 === 0) f.run();   // two pointer moves per frame
    }
    expect(setView).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledTimes(60);   // at most one preview per frame
    gesture.up();
    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView.mock.calls[0][0]).toEqual(gesture.live());
    expect(gesture.live().x0).toBeGreaterThan(START.x0);   // dragged left: the view moved east
  });

  it('sets the view once for a run of wheel steps, after the wheel goes quiet', () => {
    const { f, setView, gesture } = setup();
    for (let k = 0; k < 10; k += 1) {
      gesture.wheel(k < 5 ? -100 : 100, 0.4, 0.6, START);
      f.run();
      vi.advanceTimersByTime(120);
    }
    expect(setView).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it('ends when the view reaches the live crop, and a view set by a pinch ends it too', () => {
    const { setView, gesture } = setup();
    gesture.drag({ x: 0, y: 0, crop: START, width: 946 }, -50, 0);
    gesture.up();
    gesture.settled(setView.mock.calls[0][0], false);
    expect(gesture.live()).toBeNull();

    gesture.drag({ x: 0, y: 0, crop: START, width: 946 }, -50, 0);
    gesture.settled(START, true);   // still dragging: the preview stays
    expect(gesture.live()).not.toBeNull();
    gesture.settled({ x0: 0, z0: 0, size: 200 }, false);   // a pinch set the view and cleared the drag
    expect(gesture.live()).toBeNull();
  });

  it('cancel drops the gesture without setting the view', () => {
    const { setView, gesture } = setup();
    gesture.wheel(-100, 0.5, 0.5, START);
    gesture.cancel();
    vi.advanceTimersByTime(1000);
    expect(setView).not.toHaveBeenCalled();
    expect(gesture.live()).toBeNull();
  });
});

describe('cropTransform', () => {
  it('is empty at rest', () => {
    expect(cropTransform(START, { ...START }, 946)).toBe('');
    expect(sameCrop(START, { ...START })).toBe(true);
  });

  it('puts a ground point drawn for one crop where the other crop shows it', () => {
    const to = { x0: -40, z0: -90, size: 100 };
    const px = 946;
    const m = cropTransform(START, to, px).match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/);
    const [tx, ty, k] = m.slice(1).map(Number);
    for (const [x, z] of [[0, 0], [30, -20], [-60, 50]]) {
      const [u, v] = toMap(x, z, START);
      const [u2, v2] = toMap(x, z, to);
      expect((u / 100) * px * k + tx).toBeCloseTo((u2 / 100) * px, 1);
      expect((v / 100) * px * k + ty).toBeCloseTo((v2 / 100) * px, 1);
    }
  });
});
