import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dropFlatNormalMaps } from './suitMaterial.js';

const rootWith = (material) => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return root;
};

describe('dropFlatNormalMaps', () => {
  it('removes a normal map at scale 0 and keeps the other maps', () => {
    const map = new THREE.Texture();
    const specularColorMap = new THREE.Texture();
    const material = new THREE.MeshPhysicalMaterial({ map, specularColorMap, normalMap: new THREE.Texture(), normalScale: new THREE.Vector2(0, -0) });
    const version = material.version;
    expect(dropFlatNormalMaps(rootWith(material))).toBe(1);
    expect(material.normalMap).toBeNull();
    expect(material.map).toBe(map);
    expect(material.specularColorMap).toBe(specularColorMap);
    expect(material.version).toBeGreaterThan(version);
  });

  it('keeps a normal map that bends normals', () => {
    const normalMap = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ normalMap, normalScale: new THREE.Vector2(1, -1) });
    expect(dropFlatNormalMaps(rootWith(material))).toBe(0);
    expect(material.normalMap).toBe(normalMap);
  });
});
