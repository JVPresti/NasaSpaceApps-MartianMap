import { describe, expect, it, vi } from 'vitest';
import { coarsePointer, fullscreen, touchOnly } from './device.js';

const win = (matches) => ({ matchMedia: (q) => ({ matches: !!matches[q] }) });

describe('device (#365)', () => {
  it('is touch only when the pointer is coarse and no fine pointer is attached', () => {
    expect(touchOnly(win({ '(pointer: coarse)': true }))).toBe(true);
    expect(touchOnly(win({ '(pointer: coarse)': true, '(any-pointer: fine)': true }))).toBe(false);   // tablet with a trackpad
    expect(touchOnly(win({ '(any-pointer: fine)': true }))).toBe(false);
    expect(touchOnly(undefined)).toBe(false);
    expect(touchOnly({ matchMedia: () => { throw new Error('no'); } })).toBe(false);
    expect(coarsePointer(win({ '(pointer: coarse)': true }))).toBe(true);
  });

  it('toggles full screen and hides when the browser has none', async () => {
    const doc = { fullscreenElement: null, fullscreenEnabled: true, documentElement: {} };
    doc.documentElement.requestFullscreen = vi.fn(async () => { doc.fullscreenElement = doc.documentElement; });
    doc.exitFullscreen = vi.fn(async () => { doc.fullscreenElement = null; });
    const fs = fullscreen(doc);
    expect(fs.available).toBe(true);
    expect(await fs.toggle()).toBe(true);
    expect(await fs.toggle()).toBe(false);
    expect(fullscreen({ documentElement: {} }).available).toBe(false);   // iPhone Safari: no element full screen
  });
});
