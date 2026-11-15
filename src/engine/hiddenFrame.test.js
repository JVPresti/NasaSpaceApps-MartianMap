import { describe, expect, it, vi } from 'vitest';
import { hiddenFrame } from './hiddenFrame.js';

const canvas = (visible) => ({ checkVisibility: vi.fn(() => visible) });

describe('hiddenFrame', () => {
  it('draws while the canvas is visible', () => {
    const c = canvas(true);
    expect(hiddenFrame(c, true)).toBeNull();
    expect(c.checkVisibility).toHaveBeenCalledWith({ visibilityProperty: true });
  });

  it('skips the draw while CSS hides the canvas', () => {
    expect(hiddenFrame(canvas(false), true)).not.toBeNull();
  });

  it('always draws the first frame, which engine.ready waits for', () => {
    const c = canvas(false);
    expect(hiddenFrame(c, false)).toBeNull();
    expect(c.checkVisibility).not.toHaveBeenCalled();
  });

  it('draws in a browser without checkVisibility', () => {
    expect(hiddenFrame({}, true)).toBeNull();
    expect(hiddenFrame(null, true)).toBeNull();
  });

  it('starts the second window and the slow-second run over, so hidden time never adds to a downgrade', () => {
    expect(hiddenFrame(canvas(false), true)).toEqual({ frames: 0, acc: 0, worst: 0, slowWindows: 0, stats: { fps: 0, worstMs: 0, hidden: true } });
  });
});
