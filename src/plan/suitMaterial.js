// The Z-2 model's material carries a normal map (z2_Bump_s) at scale 0, so it was meant to change nothing. three.js
// still builds a tangent frame for it from screen-space UV derivatives, and where the UVs fold or collapse that frame
// breaks: the Suit step showed blue-white and black flecks over the fabric that read as missing texture (#342). A
// normal map at scale 0 bends no normal, so dropping it changes nothing else. The partner outside never had the
// flecks, because its shader in partner.js samples only the colour map.

/**
 * Removes every normal map whose scale is 0 from the mesh materials under `root`. Returns how many materials changed.
 * @param {{ traverse: (fn: (node: object) => void) => void }} root a loaded glTF scene
 */
export function dropFlatNormalMaps(root) {
  let changed = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material?.normalMap || material.normalScale.x !== 0 || material.normalScale.y !== 0) continue;
      material.normalMap = null;
      material.needsUpdate = true;
      changed += 1;
    }
  });
  return changed;
}
