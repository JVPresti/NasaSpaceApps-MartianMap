// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 363-384).
import * as THREE from 'three';

export function createCast(ctx) {
  const { scene, renderer, U } = ctx;
  const cast = {   // slots 0 and 1 are redrawn every frame (astronauts, layer 1); slot 2 (habitat, layer 2) only when the sun moves
    rt: new THREE.WebGLRenderTarget(768, 256), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }), on: [false, false, false], sunSeen: new THREE.Vector3(), dirty: true,
    mark(root, only) { root.traverse(o => { if (o.isSkinnedMesh) { if (only) o.layers.set(1); else o.layers.enable(1); } }); },
    set(i, on, x, y, z) { this.on[i] = on; if (on) U.uCastC.value[i].set(x, y + 1.0, z); else U.uCastC.value[i].set(0, -1e5, 0); },
    render() {
      const active = ctx.tier === 'high' && U.uBlob.value > 0.02 && (this.on[0] || this.on[1] || this.on[2]); U.uCastOn.value = active ? 1 : 0; if (!active) { this.dirty = true; return; }
      const s = U.uSunDir.value, r = U.uCastR.value.set(0, 1, 0).cross(s).normalize(), u = U.uCastU.value.copy(s).cross(r).normalize();
      if (!this.sunSeen.equals(s)) { this.sunSeen.copy(s); this.dirty = true; }
      U.tCast.value = this.rt.texture; this.rt.scissorTest = true;
      const bg = scene.background; scene.background = null; scene.overrideMaterial = this.mat; renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 1);
      for (let i = 0; i < 3; i++) {
        if (i === 2 && !this.dirty) continue;
        this.rt.viewport.set(i * 256, 0, 256, 256); this.rt.scissor.set(i * 256, 0, 256, 256); renderer.setRenderTarget(this.rt); renderer.clear();
        if (!this.on[i]) continue; const c = U.uCastC.value[i], hs = U.uCastS.value[i];
        this.cam.left = -hs; this.cam.right = hs; this.cam.top = hs; this.cam.bottom = -hs; this.cam.updateProjectionMatrix(); this.cam.layers.set(i === 2 ? 2 : 1);
        this.cam.position.copy(c).addScaledVector(s, 30); this.cam.up.copy(u); this.cam.lookAt(c); this.cam.updateMatrixWorld();
        renderer.render(scene, this.cam);
      }
      this.dirty = false; scene.overrideMaterial = null; scene.background = bg; renderer.setRenderTarget(null);
    },
  };
  return cast;
}
