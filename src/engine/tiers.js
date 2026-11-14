// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 10-16, 881-884).
export const TIERS = {
  high: { grid: 501, chunks: 4, ortho: 'ortho_hi.jpg', pixelRatio: 2, aniso: 8, shadowRes: 512,
          radius: [12, 55, 180], lod: [0.03, 0.008], blobs: true },
  low:  { grid: 189, chunks: 4, ortho: 'ortho_lo.jpg', pixelRatio: 1, aniso: 2, shadowRes: 256,
          radius: [0, 28, 110], lod: [0.05, 0.014], blobs: false },
};

// weak GPUs start on Low (bench boot, lines 881-884)
export function detectTier(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'), gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  const weak = /Intel|SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Apple GPU|Microsoft Basic/i.test(gpu) && !/Arc|Iris Xe/i.test(gpu);
  return { tier: weak ? 'low' : 'high', gpu };
}
