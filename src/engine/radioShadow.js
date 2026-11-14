// Blue-grey ground cells where the radio link to the habitat mast is blocked
// (#74). Same quad approach as the slope no-go patch, at 20 m resolution.
import * as THREE from 'three';

export function createRadioShadow(ctx) {
  const group = new THREE.Group();
  ctx.scene.add(group);
  const material = new THREE.MeshBasicMaterial({
    color: 0x5b8fbf,
    transparent: true,
    opacity: 0.3,
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
  function set(cells, cellM = 20) {
    clear();
    if (!Array.isArray(cells) || cells.length === 0) return;
    const half = cellM * 0.5;
    const positions = new Float32Array(cells.length * 4 * 3);
    const indices = [];
    let p = 0;
    cells.forEach((cell, index) => {
      const base = index * 4;
      for (const [x, z] of [
        [cell.x - half, cell.z - half],
        [cell.x + half, cell.z - half],
        [cell.x + half, cell.z + half],
        [cell.x - half, cell.z + half],
      ]) {
        positions[p++] = x;
        positions[p++] = ctx.terrain.meshH(x, z) + 0.18;
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
