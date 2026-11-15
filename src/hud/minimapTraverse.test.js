import { describe, expect, it } from 'vitest';
import { drawMinimap, drawTraverse } from './minimapDraw.js';

// A canvas context that records the strokes, enough for the minimap painter.
function recorder() {
  const strokes = [];
  let path = [];
  const g = new Proxy({ strokeStyle: null, lineWidth: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'beginPath') return () => { path = []; };
      if (key === 'moveTo' || key === 'lineTo') return (x, y) => path.push([x, y]);
      if (key === 'stroke') return () => strokes.push({ color: target.strokeStyle, width: target.lineWidth, points: path.length });
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { g, strokes };
}

const drives = [{ sol: 1185, points: [[0, 0], [10, 0], [10, 10]] }, { sol: 1210, points: [[-5, 2], [0, 0]] }];
const identity = (x, z) => ({ x, y: z });

describe('Perseverance on the minimap (#249)', () => {
  it('strokes every drive point, an edge and then the warm-white line', () => {
    const { g, strokes } = recorder();
    drawTraverse(g, drives, identity, 100);
    expect(strokes.map((s) => s.color)).toEqual(['rgba(10, 13, 17, 0.55)', '#f4f1ea']);
    expect(strokes.every((s) => s.points === 5)).toBe(true);
  });

  it('draws nothing without drives', () => {
    const { g, strokes } = recorder();
    drawTraverse(g, [], identity, 100);
    drawTraverse(g, undefined, identity, 100);
    expect(strokes).toEqual([]);
  });

  it('is part of the minimap when the drives are given', () => {
    const { g, strokes } = recorder();
    drawMinimap(g, { size: 200, dpr: 1, centre: { x: 0, z: 0 }, headingDeg: 0, traverse: drives });
    expect(strokes.some((s) => s.color === '#f4f1ea')).toBe(true);
  });
});
