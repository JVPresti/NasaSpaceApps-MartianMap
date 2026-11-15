// The Z-2 model's material carries a KHR_materials_specular map (z2_spec_color_s). Under the Suit step's key light it
// paints blue-white flecks over the fabric that read as missing texture (#342). The partner outside never shows them,
// because its shader in partner.js samples only the colour map. Dropping the specular maps gives the Suit step the
// same clean fabric; the colour map, the roughness and the lights stay as they are.

/**
 * Removes the specular maps from every mesh material under `root`. Returns how many materials changed.
 * @param {{ traverse: (fn: (node: object) => void) => void }} root a loaded glTF scene
 */
export function dropSpecularMaps(root) {
  let changed = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material || (!material.specularColorMap && !material.specularIntensityMap)) continue;
      material.specularColorMap = null;
      material.specularIntensityMap = null;
      material.needsUpdate = true;
      changed += 1;
    }
  });
  return changed;
}
