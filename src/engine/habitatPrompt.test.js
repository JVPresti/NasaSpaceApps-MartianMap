import { describe, expect, it } from 'vitest';
import { CABIN_ZONES, isCabinZone, layoutPrompt, MAX_ROWS, promptRows } from './habitatPrompt.js';

// A fixed-width font: 30 px per character for the text, 32 px for the key letters.
const measure = (font, text) => text.length * (font.includes('monospace') ? 32 : 30);

describe('habitat table prompt (#244)', () => {
  it('reads a two-row prompt, a single { key, text } row, and nothing else', () => {
    expect(promptRows({ rows: [{ key: 'E', text: 'Open plan' }, { key: 'X', text: 'No EVA in progress', dim: true }] })).toEqual([
      { key: 'E', text: 'Open plan', dim: false },
      { key: 'X', text: 'No EVA in progress', dim: true },
    ]);
    expect(promptRows({ key: 'X', text: 'Finish EVA' })).toEqual([{ key: 'X', text: 'Finish EVA', dim: false }]);
    expect(promptRows(null)).toBeNull();
    expect(promptRows({ rows: [] })).toBeNull();
    expect(promptRows({ rows: [{ key: 'E' }, null] })).toBeNull();
    expect(promptRows({ rows: [1, 2, 3].map((n) => ({ key: String(n), text: 'row' })) })).toHaveLength(MAX_ROWS);
  });

  it('stacks the rows in one panel, caps in one column and the text lined up after them', () => {
    const rows = promptRows({ rows: [{ key: 'E', text: 'Make a plan' }, { key: 'X', text: 'No EVA in progress', dim: true }] });
    const L = layoutPrompt(rows, measure);
    expect(L.rows).toHaveLength(2);
    expect(L.rows[1].top).toBeGreaterThan(L.rows[0].top);
    expect(L.rows[1].dim).toBe(true);
    // both rows inside the panel, the panel inside the canvas and centred on it
    expect(L.rows[0].top).toBeGreaterThan(L.panel.y);
    expect(L.rows[1].mid).toBeLessThan(L.panel.y + L.panel.h);
    expect(L.panel.x).toBeCloseTo((L.width - L.panel.w) / 2);
    expect(L.panel.y).toBeCloseTo((L.height - L.panel.h) / 2);
    // the panel fits the longer line exactly
    expect(L.textX + L.textMaxW).toBeLessThanOrEqual(L.panel.x + L.panel.w);
    expect(L.textMaxW).toBe(measure('600', 'No EVA in progress'));
  });

  it('keeps a one-row prompt centred, and squeezes a line too long for the canvas inside the panel', () => {
    const one = layoutPrompt(promptRows({ key: 'X', text: 'Finish EVA' }), measure);
    expect(one.panel.y + one.panel.h / 2).toBeCloseTo(one.height / 2);
    const long = layoutPrompt(promptRows({ key: 'E', text: 'x'.repeat(80) }), measure);
    expect(long.panel.w).toBeLessThanOrEqual(long.width);
    expect(long.textX + long.textMaxW).toBeLessThanOrEqual(long.panel.x + long.panel.w);
    expect(long.textMaxW).toBeGreaterThan(0);
  });

  it('counts only the main room and the inner hatch as the cabin, not the porch, steps or airlock', () => {
    expect(CABIN_ZONES).toEqual(['main', 'inner']);
    for (const z of ['main', 'inner']) expect(isCabinZone(z)).toBe(true);
    for (const z of ['stairs', 'porch', 'hatch', 'airlock', null, undefined]) expect(isCabinZone(z)).toBe(false);
  });
});
