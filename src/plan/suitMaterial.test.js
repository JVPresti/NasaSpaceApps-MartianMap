import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dropSpecularMaps } from './suitMaterial.js';

describe('dropSpecularMaps', () => {
  it('removes the specular maps and keeps the colour map', () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshPhysicalMaterial({ map, specularColorMap: new THREE.Texture(), specularIntensityMap: new THREE.Texture() });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    const version = material.version;
    expect(dropSpecularMaps(root)).toBe(1);
    expect(material.specularColorMap).toBeNull();
    expect(material.specularIntensityMap).toBeNull();
    expect(material.map).toBe(map);
    expect(material.version).toBeGreaterThan(version);
  });

  it('leaves a material without specular maps alone', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
    expect(dropSpecularMaps(root)).toBe(0);
  });
});
