import { describe, expect, it } from 'vitest';
import { detectTier } from './tiers.js';

const UNMASKED_RENDERER_WEBGL = 0x9246;

// Just enough of a THREE.WebGLRenderer for detectTier: a context that reports `gpu` as the unmasked renderer name.
// `gpu === null` means the browser hides WEBGL_debug_renderer_info.
function fakeRenderer(gpu) {
  const gl = {
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' && gpu !== null ? { UNMASKED_RENDERER_WEBGL } : null),
    getParameter: (param) => (param === UNMASKED_RENDERER_WEBGL ? gpu : null),
  };
  return { getContext: () => gl };
}

const tierOf = (gpu) => detectTier(fakeRenderer(gpu)).tier;

describe('detectTier', () => {
  it('starts a touch-only device on Low whatever its GPU name says (#365)', () => {
    const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    expect(detectTier(fakeRenderer(gpu)).tier).toBe('high');
    expect(detectTier(fakeRenderer(gpu), { touchOnly: true }).tier).toBe('low');
    expect(detectTier(fakeRenderer(''), { touchOnly: true }).tier).toBe('low');   // a browser that hides the name
    expect(detectTier(fakeRenderer('Apple GPU')).tier).toBe('low');
    expect(detectTier(fakeRenderer('Adreno (TM) 740')).tier).toBe('low');
    expect(detectTier(fakeRenderer('Mali-G78 MP14')).tier).toBe('low');
  });

  it('returns the tier and the GPU name it read', () => {
    const gpu = 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    expect(detectTier(fakeRenderer(gpu))).toEqual({ tier: 'low', gpu });
  });

  // Assumed decision for #130: nobody has measured an Iris Xe laptop, so Iris Xe starts on High and the
  // 3-second automatic downgrade protects it.
  it.each([
    'Intel(R) Iris(R) Xe Graphics',
    'Intel Iris Xe Graphics',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mesa Intel(R) Xe Graphics (TGL GT2)',
    'ANGLE (Intel, Mesa Intel(R) Xe Graphics (TGL GT2), OpenGL 4.6)',
  ])('starts Intel Iris Xe on High: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('high');
  });

  it.each([
    'Intel(R) Arc(TM) A770 Graphics',
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('starts Intel Arc on High: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('high');
  });

  it.each([
    'Intel(R) UHD Graphics 620',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    // Older Intel iGPUs whose names are close to Iris Xe stay on Low.
    'ANGLE (Intel, Intel(R) Iris(R) Plus Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Iris(TM) Pro Graphics 6200 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    // Made-up name: "arc" inside another word is not Intel Arc.
    'Intel(R) HD Graphics (Monarch)',
  ])('starts other Intel GPUs on Low: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('low');
  });

  // Measured on a Ryzen 5 5600H (docs/marswalk-assets/README.md, Tiers): AMD integrated graphics start on Low.
  it.each([
    'AMD Radeon(TM) Graphics',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('starts AMD integrated graphics on Low: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('low');
  });

  it.each([
    'ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Pro WX 3200 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('starts discrete AMD cards and named APUs on High: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('high');
  });

  it.each([
    'NVIDIA GeForce RTX 3060 Laptop GPU/PCIe/SSE2',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('starts NVIDIA RTX on High: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('high');
  });

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'ANGLE (Mesa, llvmpipe (LLVM 15.0.7 256 bits), OpenGL 4.5)',
  ])('starts software renderers on Low: %s', (gpu) => {
    expect(tierOf(gpu)).toBe('low');
  });

  it('starts on High when the browser hides the GPU name', () => {
    expect(detectTier(fakeRenderer(null))).toEqual({ tier: 'high', gpu: '' });
  });
});
