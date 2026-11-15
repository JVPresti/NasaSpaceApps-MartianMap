import { describe, expect, it } from 'vitest';
import { zoneMask, ZONE_TEXELS } from './slopeZoneRules.js';

const at = (m, i, j) => m.data[j * ZONE_TEXELS + i];

describe('slope zone mask', () => {
  it('is empty without cells', () => {
    expect(zoneMask(null, 3)).toBeNull();
    expect(zoneMask([], 3)).toBeNull();
  });
  it('puts one texel on each cell centre', () => {
    const m = zoneMask([{ x: 1.5, z: 1.5 }, { x: 4.5, z: 1.5 }], 3);
    expect(m.span).toBe(ZONE_TEXELS * 3);
    const i = (1.5 - m.x0) / 3 - 0.5, j = (1.5 - m.z0) / 3 - 0.5;
    expect(Number.isInteger(i) && Number.isInteger(j)).toBe(true);
    expect(at(m, i, j)).toBe(255);
    expect(at(m, i + 1, j)).toBe(255);
    expect(at(m, i - 1, j)).toBe(0);
    expect(m.data.reduce((s, v) => s + (v ? 1 : 0), 0)).toBe(2);
  });
  it('keeps an empty border so the edge fades out', () => {
    const cells = [];
    for (let k = -20; k <= 20; k++) cells.push({ x: k * 3 + 1.5, z: 1.5 });   // 41 cells, wider than the texture
    const m = zoneMask(cells, 3);
    for (let j = 0; j < ZONE_TEXELS; j++) {
      expect(at(m, 0, j)).toBe(0);
      expect(at(m, ZONE_TEXELS - 1, j)).toBe(0);
    }
  });
  it('fits the full 18 m zone from slopeAhead', () => {
    const cells = [];
    for (let z = -18; z <= 18; z += 3) for (let x = -18; x <= 18; x += 3) if (x * x + z * z <= 18 * 18) cells.push({ x: x + 1.5, z: z + 1.5 });
    const m = zoneMask(cells, 3);
    expect(m.data.reduce((s, v) => s + (v ? 1 : 0), 0)).toBe(cells.length);
  });
});
