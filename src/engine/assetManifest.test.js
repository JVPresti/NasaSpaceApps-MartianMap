import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAssetManifest, FURNITURE_MODELS } from './assetManifest.js';

const root = fileURLToPath(new URL('../../public/marswalk/', import.meta.url));

describe('buildAssetManifest', () => {
  it('lists every initial file once and each one exists on disk', () => {
    const manifest = buildAssetManifest('high');

    expect(new Set(manifest).size).toBe(manifest.length);
    expect(manifest.length).toBeGreaterThan(30);
    for (const file of manifest) expect(existsSync(root + file), file).toBe(true);
  });

  it('includes every furniture model that layout.json places', () => {
    const layout = JSON.parse(readFileSync(root + 'assets_habitat/furniture/layout.json', 'utf8'));
    const used = [...new Set(layout.items.map((item) => item.model))];
    const manifest = buildAssetManifest('high');

    for (const model of used) {
      expect(FURNITURE_MODELS).toContain(model);
      expect(manifest).toContain('assets_habitat/furniture/' + model + '.glb');
    }
  });

  it('swaps only the ortho and outcrop textures between tiers', () => {
    const high = buildAssetManifest('high');
    const low = buildAssetManifest('low');

    expect(high).toContain('assets/ortho_hi.jpg');
    expect(low).toContain('assets/ortho_lo.jpg');
    expect(low).not.toContain('assets/ortho_hi.jpg');
    expect(high).toContain('assets/outcrop_color.jpg');
    expect(low).toContain('assets/outcrop_color_lo.jpg');
    expect(low).toContain('assets/outcrop_nao_lo.jpg');
    expect(low).not.toContain('assets/outcrop_color.jpg');
    for (const file of low) expect(existsSync(root + file), file).toBe(true);
    expect(high.length).toBe(low.length);
  });
});
