// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 605-609).
import * as THREE from 'three';

export function cloneSkinned(src) {   // minimal SkeletonUtils.clone
  const map = new Map(), clone = src.clone(true); const walk = (a, b) => { map.set(a, b); a.children.forEach((c, i) => walk(c, b.children[i])); }; walk(src, clone);
  clone.traverse(o => { if (o.isSkinnedMesh) { const s = [...map.entries()].find(([, v]) => v === o)[0]; o.skeleton = new THREE.Skeleton(s.skeleton.bones.map(b => map.get(b)), s.skeleton.boneInverses); o.bind(o.skeleton, s.bindMatrix); } });
  return clone;
}
