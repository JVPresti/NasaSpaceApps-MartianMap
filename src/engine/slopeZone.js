// Red ground patch for cells over the slope limit (#69). The cells come from
// src/sim/slopeAhead.js and are drawn as small quads on the visible terrain.
import * as THREE from 'three';

export function createSlopeZone(ctx) {
  const group = new THREE.Group();
  ctx.scene.add(group);
  const material = new THREE.MeshBasicMaterial({
    color: 0xe63a1f,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -10,
  });

  function clear() {
    for (const mesh of [...group.children]) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
  }

  /**
   * @param {Array<{ x: number, z: number }> | null} cells
   * @param {number} [cellM]
   */
  function set(cells, cellM = 3) {
    clear();
    if (!Array.isArray(cells) || cells.length === 0) return;
    const half = cellM * 0.45;
    const positions = new Float32Array(cells.length * 4 * 3);
    const indices = [];
    let p = 0;
    cells.forEach((cell, index) => {
      const base = index * 4;
      const corners = [
        [cell.x - half, cell.z - half],
        [cell.x + half, cell.z - half],
        [cell.x + half, cell.z + half],
        [cell.x - half, cell.z + half],
      ];
      for (const [x, z] of corners) {
        positions[p++] = x;
        positions[p++] = ctx.terrain.meshH(x, z) + 0.16;
        positions[p++] = z;
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
  }

  function dispose() {
    clear();
    material.dispose();
    ctx.scene.remove(group);
  }

  return { group, set, clear, dispose };
}
