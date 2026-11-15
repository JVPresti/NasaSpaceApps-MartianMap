// Red ground tint for cells over the slope limit (#69). The cells come from src/sim/slopeAhead.js. The terrain shader draws
// the tint (TERRAIN_FRAG, tZone), not separate quads, so the zone takes the terrain's own sun, shadow and lamp light and has no
// gaps between cells (#200). This module only fills the mask texture and its placement uniforms.
import * as THREE from 'three';
import { zoneMask, ZONE_TEXELS } from './slopeZoneRules.js';

export function createSlopeZone(ctx) {
  const { U } = ctx;
  const n = ZONE_TEXELS;
  const texture = new THREE.DataTexture(new Uint8Array(n * n), n, n, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  U.tZone.value = texture;

  function clear() {
    U.uZoneOn.value = 0;
  }

  /**
   * @param {Array<{ x: number, z: number }> | null} cells
   * @param {number} [cellM]
   */
  function set(cells, cellM = 3) {
    const mask = zoneMask(cells, cellM, n);
    if (!mask) { clear(); return; }
    texture.image.data.set(mask.data);
    texture.needsUpdate = true;
    U.uZoneBox.value.set(mask.x0, mask.z0, mask.span);
    U.uZoneOn.value = 1;
  }

  function dispose() {
    clear();
    U.tZone.value = null;
    texture.dispose();
  }

  return { set, clear, dispose };
}
