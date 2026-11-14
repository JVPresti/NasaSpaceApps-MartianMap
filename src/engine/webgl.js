// WebGL 2 is the renderer's hard requirement. Check before loading 18 MB of assets, and turn a
// synchronous THREE.WebGLRenderer failure into the same explainable error.
import { WebGLUnsupportedError } from './errors.js';

export function hasWebGL2(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return false;
  try {
    const canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    try { gl.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch { /* Cleanup does not change support. */ }
    return true;
  } catch {
    return false;
  }
}

export function assertWebGL2() {
  if (!hasWebGL2()) {
    throw new WebGLUnsupportedError('WebGL 2 is not available in this browser.', {
      detail: 'The 3D scene needs WebGL 2. Enable hardware acceleration in your browser settings, or open the app in a current browser.',
    });
  }
}

export function rendererFailure(cause) {
  return new WebGLUnsupportedError('The 3D renderer could not start on this device.', {
    cause,
    detail: 'WebGL 2 is available, but the browser could not create a graphics context. Close other 3D tabs, update the graphics driver, or try another browser.',
  });
}
