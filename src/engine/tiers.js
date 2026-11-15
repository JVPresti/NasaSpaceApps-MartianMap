// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 10-16, 881-884).
export const TIERS = {
  high: { grid: 501, chunks: 4, ortho: 'ortho_hi.jpg', pixelRatio: 2, aniso: 8, shadowRes: 512,
          radius: [12, 55, 180], lod: [0.03, 0.008], blobs: true },
  low:  { grid: 189, chunks: 4, ortho: 'ortho_lo.jpg', pixelRatio: 1, aniso: 2, shadowRes: 256,
          radius: [0, 28, 110], lod: [0.05, 0.014], blobs: false },
};

// weak GPUs start on Low (bench boot, lines 881-884)
// A touch-only device (a phone or a tablet without a mouse, src/input/device.js) starts on Low whatever its GPU reports
// (#365): Safari reports every Apple chip as "Apple GPU", some Android browsers hide the name, and a phone's battery and
// heat matter as much as its peak speed. ?tier=high or the High button in the settings still overrides it.
export function detectTier(renderer, { touchOnly = false } = {}) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'), gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  // AMD integrated graphics ("AMD Radeon(TM) Graphics", "Radeon Vega 8 Graphics") also start on Low: measured on a Ryzen 5 5600H,
  // High drops to 41 fps inside the habitat while Low holds 58-60 everywhere (docs/marswalk-assets/README.md, Tiers).
  // Discrete cards ("Radeon RX ...", "Radeon Pro ...") and newer named iGPUs ("Radeon 780M") keep High; the 3-second check still guards them.
  const amdIntegrated = /Radeon(\(TM\))? (Graphics|Vega)/i.test(gpu) && !/Radeon(\(TM\))? (RX|Pro)/i.test(gpu);
  // Intel Arc and Iris Xe keep High. Real names: "Intel(R) Arc(TM) A770 Graphics", "Intel(R) Iris(R) Xe Graphics" (Windows, often
  // inside "ANGLE (Intel, ... Direct3D11 ...)"), "Mesa Intel(R) Xe Graphics (TGL GT2)" (Linux). Whole words only, so "arc" inside
  // another word does not count. Not measured on an Iris Xe laptop yet; the 3-second check drops it to Low if High is too slow.
  const intelFast = /\bArc\b|\bIris(\(R\))? ?Xe\b|\bIntel(\(R\))? Xe Graphics\b/i.test(gpu);
  const weak = (/Intel|SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Apple GPU|Microsoft Basic/i.test(gpu) && !intelFast) || amdIntegrated;
  return { tier: weak || touchOnly ? 'low' : 'high', gpu };
}
