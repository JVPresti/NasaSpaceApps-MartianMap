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
  // AMD integrated graphics ("AMD Radeon(TM) Graphics", "Radeon Vega 8 Graphics") also start on Low: measured on a Ryzen 5 5600H,
  // High drops to 41 fps inside the habitat while Low holds 58-60 everywhere (docs/marswalk-assets/README.md, Tiers).
  // Discrete cards ("Radeon RX ...", "Radeon Pro ...") and newer named iGPUs ("Radeon 780M") keep High; the 3-second check still guards them.
  const amdIntegrated = /Radeon(\(TM\))? (Graphics|Vega)/i.test(gpu) && !/Radeon(\(TM\))? (RX|Pro)/i.test(gpu);
  const weak = (/Intel|SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Apple GPU|Microsoft Basic/i.test(gpu) && !/Arc|Iris Xe/i.test(gpu)) || amdIntegrated;
  return { tier: weak ? 'low' : 'high', gpu };
}
