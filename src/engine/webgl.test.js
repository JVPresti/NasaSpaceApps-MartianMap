import { describe, expect, it } from 'vitest';
import { hasWebGL2, rendererFailure } from './webgl.js';
import { WebGLUnsupportedError } from './errors.js';

describe('WebGL support', () => {
  it('rejects unavailable or disabled WebGL2', () => {
    expect(hasWebGL2({ createElement: () => ({ getContext: () => null }) })).toBe(false);
    expect(hasWebGL2({ createElement: () => ({ getContext: () => { throw new Error('disabled'); } }) })).toBe(false);
  });

  it('does not report supported WebGL2 as unsupported when probe cleanup fails', () => {
    const gl = { getExtension: () => ({ loseContext: () => { throw new Error('cleanup'); } }) };
    expect(hasWebGL2({ createElement: () => ({ getContext: () => gl }) })).toBe(true);
  });

  it('preserves renderer startup failure with an actionable message', () => {
    const cause = new Error('context creation failed');
    const error = rendererFailure(cause);
    expect(error).toBeInstanceOf(WebGLUnsupportedError);
    expect(error.cause).toBe(cause);
    expect(error.detail).toContain('graphics context');
  });
});
