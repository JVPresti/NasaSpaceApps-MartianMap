// Dust when sampling (issue #50): when the scoop goes into the soil, a puff of dust and grains, and the scrape it leaves.
//   - puff: one burst of grains, clods and fine dust at the sample point, timed to the moment the scoop enters the ground in the arm clip
//     (sampling.js reports the sample with its point; the clip timing is below). A smaller puff for rock chips.
//   - mark: a scoop-shaped hollow in the soil, kept for the EVA like the boot prints (last MARKS_KEPT samples)
// Shaders: sampleDust.shaders.js.
//
//   sys.sampleDust.update(dt)    once per frame, after the sampling module
import * as THREE from 'three';
import * as SH from './sampleDust.shaders.js';

const GRAVITY = 3.71;                                     // m/s2, Mars
const CONTACT_S = { collect_ground: 2.1, collect_rock: 1.3 };   // when the scoop meets the soil or the rock face in each clip
const GRAINS = { collect_ground: 180, collect_rock: 70 };   // each point is a grain, a clod or fine dust at random (see the shader)
const MARKS_KEPT = 32;
const MARK_W = 0.18, MARK_L = 0.3;                        // scrape size, metres
const PUFF_S = 2.8;                                       // how long a puff is drawn

export function createSampleDust(ctx) {
  const { scene, U, sys, view, renderer, camera } = ctx;
  const { meshH } = ctx.terrain;

  // puff: one Points burst, re-aimed for each sample
  const puffUniforms = {
    uSunColor: U.uSunColor, uAmbSky: U.uAmbSky, uInscatter: U.uInscatter,
    uOrigin: { value: new THREE.Vector3() }, uT: { value: 0 }, uGround: { value: 0 }, uPointScale: { value: 1 }, uGravity: { value: GRAVITY },
  };
  const puffGeo = new THREE.BufferGeometry();
  const n = GRAINS.collect_ground, seeds = new Float32Array(n * 4);
  let s = 424242;
  for (let i = 0; i < seeds.length; i++) seeds[i] = (s = (s * 16807) % 2147483647) / 2147483647;
  puffGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  puffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // unused, three.js needs it
  const puff = new THREE.Points(puffGeo, new THREE.ShaderMaterial({ uniforms: puffUniforms, vertexShader: SH.PUFF_VERT, fragmentShader: SH.PUFF_FRAG, transparent: true, depthWrite: false }));
  puff.frustumCulled = false; puff.renderOrder = 6; puff.visible = false;
  scene.add(puff);

  // marks: instanced quads lying on the ground, blended like the boot prints
  const markGeo = new THREE.PlaneGeometry(MARK_W, MARK_L); markGeo.rotateX(-Math.PI / 2);
  const marks = new THREE.InstancedMesh(markGeo, new THREE.ShaderMaterial({
    uniforms: { uFogK: U.uFogK }, vertexShader: SH.MARK_VERT, fragmentShader: SH.MARK_FRAG,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }), MARKS_KEPT);
  marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 1;
  scene.add(marks);
  let nextMark = 0, markCount = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), size = new THREE.Vector2();

  let pending = null;   // { kind, x, z, yaw } waiting for the scoop to reach the ground
  let age = Infinity;
  const unsubscribe = sys.sampling.subscribe((e) => {
    if (e.type === 'collect') pending = { clip: e.kind === 'ground' ? 'collect_ground' : 'collect_rock', x: e.x, z: e.z, yaw: view.yaw };
  });

  function burst(b) {
    const ground = meshH(b.x, b.z);
    puffUniforms.uOrigin.value.set(b.x, ground + 0.03, b.z);
    puffUniforms.uGround.value = ground + 0.01;
    puffGeo.setDrawRange(0, GRAINS[b.clip]);
    age = 0;
    if (b.clip !== 'collect_ground') return;
    q.setFromAxisAngle(up, -b.yaw);   // the scrape runs the way the player faces
    p.set(b.x, ground + 0.012, b.z);
    marks.setMatrixAt(nextMark, m.compose(p, q, one));
    nextMark = (nextMark + 1) % MARKS_KEPT; markCount = Math.min(markCount + 1, MARKS_KEPT);
    marks.count = markCount; marks.instanceMatrix.needsUpdate = true;
  }

  return {
    /** @param {number} dt */
    update(dt) {
      const arms = sys.arms;
      if (pending && arms.clip && arms.clipName === pending.clip && arms.clip.time >= CONTACT_S[pending.clip]) { burst(pending); pending = null; }
      if (pending && !arms.clip) pending = null;   // the clip was cut short
      age += dt;
      puff.visible = age < PUFF_S;
      if (!puff.visible) return;
      puffUniforms.uT.value = age;
      renderer.getDrawingBufferSize(size);
      puffUniforms.uPointScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    dispose() {
      unsubscribe();
      puffGeo.dispose(); puff.material.dispose(); markGeo.dispose(); marks.material.dispose(); marks.dispose();
      scene.remove(puff); scene.remove(marks);
    },
  };
}
