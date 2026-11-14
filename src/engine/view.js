// Camera modes and input. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 785-808, 829-850).
//   walk: first person at eye height (the bench's 'eye' mode): drag to look, WASD / arrows to walk, Shift to jog.
//         Interim control; pointer lock comes with issue #13.
//   plan: the site from above (OrbitControls): drag to orbit, scroll to zoom, right-drag to pan.
// Internally view.mode keeps the bench's values ('eye' | 'orbit') because the arms, legs and habitat check them.
import * as THREE from 'three';

export const START = new THREE.Vector3(8, 0, 70);   // 70 m south of Cheyava Falls, in Neretva Vallis
const PLAN_HEIGHT = 1450, PLAN_SOUTH = 520;          // fits the 1422 x 1500 m tile, tilted slightly so the relief reads
const NEAR = { eye: 0.15, orbit: 5 };

export function createViewState() {
  return { mode: 'eye', yaw: -0.11, pitch: 0, eye: START.clone(), keys: {}, moveSpeed: 0 };
}

export function createView(ctx, canvas, signal) {
  const { camera, controls, view, sys } = ctx;
  const { meshH, groundH, tileH } = ctx.terrain;
  const { T } = ctx;
  const keys = view.keys;
  let drag = false, lx = 0, ly = 0;

  addEventListener('keydown', (e) => { keys[e.code] = true; }, { signal });
  addEventListener('keyup', (e) => { keys[e.code] = false; }, { signal });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; }, { signal });   // no stuck keys after alt-tab
  canvas.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); }, { signal });
  canvas.addEventListener('pointerup', () => { drag = false; }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (view.mode !== 'eye' || !drag) return;
    view.yaw += (e.clientX - lx) * 0.004; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY;
  }, { signal });

  function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }

  /** @param {'plan' | 'walk'} m */
  function setMode(m) {
    if (m === 'plan') {
      view.mode = 'orbit'; controls.enabled = true; setNear(NEAR.orbit);
      const h0 = tileH(0, 0);
      camera.position.set(0, h0 + PLAN_HEIGHT, PLAN_SOUTH); controls.target.set(0, h0, 0); controls.update();
    } else {
      // walk keeps the position and heading the player had when they left it
      view.mode = 'eye'; controls.enabled = false; setNear(NEAR.eye);
    }
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let bobAmp = 0, bobPhase = 0, camGround = 0, camDuck = 0, groundInit = false;

  function update(dt) {
    const { arms, rocks, partner, habitat } = sys;
    if (view.mode === 'eye') {
      const eye = view.eye, yaw = view.yaw;
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.5 : 1.4) * dt, ex = eye.x, ez = eye.z;
      fwd.set(Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
      if (keys.KeyW || keys.ArrowUp) eye.addScaledVector(fwd, sp);
      if (keys.KeyS || keys.ArrowDown) eye.addScaledVector(fwd, -sp);
      if (keys.KeyD || keys.ArrowRight) eye.addScaledVector(right, sp);
      if (keys.KeyA || keys.ArrowLeft) eye.addScaledVector(right, -sp);
      if (!arms.clip) { rocks.collide(eye, 0.3); if (partner.root && partner.root.visible) { const dx = eye.x - partner.root.position.x, dz = eye.z - partner.root.position.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 1e-4) { eye.x = partner.root.position.x + dx / d * 0.9; eye.z = partner.root.position.z + dz / d * 0.9; } } }
      if (!habitat.canStand(eye.x, eye.z)) { if (habitat.canStand(eye.x, ez)) eye.z = ez; else if (habitat.canStand(ex, eye.z)) eye.x = ex; else { eye.x = ex; eye.z = ez; } }   // habitat walls: slide along them
      eye.x = Math.max(-T.W / 2 + 3, Math.min(T.W / 2 - 3, eye.x)); eye.z = Math.max(-T.H / 2 + 3, Math.min(T.H / 2 - 3, eye.z));
      const cc = arms.cam, cs = Math.min(1, cc.pitch / (arms.CLIP_PITCH[arms.clipName] || 1)), cx = eye.x + Math.sin(yaw) * cc.fwd, cz = eye.z - Math.cos(yaw) * cc.fwd;   // interaction clips can crouch the camera
      const dig = (arms.clipName === 'collect_ground' ? Math.min(1, -cc.drop / 0.86) : 0) * (meshH(eye.x + Math.sin(yaw) * 0.47, eye.z - Math.cos(yaw) * 0.47) - meshH(eye.x, eye.z));   // follow the ground at the dig point on slopes
      const gT = habitat.ground(eye.x, eye.z), dT = habitat.duck(eye.x, eye.z);
      camGround = !groundInit || Math.abs(gT - camGround) > 1.5 ? gT : camGround + (gT - camGround) * Math.min(1, dt * 12); groundInit = true;
      camDuck += (dT - camDuck) * Math.min(1, dt * 10);
      camera.position.set(cx, camGround + 1.7 - camDuck + cc.drop + dig, cz); camera.rotation.set(-(view.pitch * (1 - cs) + cc.pitch * cs), -yaw, 0, 'YXZ');
      view.moveSpeed = Math.hypot(eye.x - ex, eye.z - ez) / Math.max(dt, 1e-4);
      // reference head bob: one bounce per step; jogging on Mars is a slow lope (long 2 m strides, bigger bounce). Camera only, no asset involved.
      const jog = view.moveSpeed > 3, bt = arms.clip ? 0 : view.moveSpeed > 0.1 ? (jog ? 0.045 : 0.012) : 0; bobAmp += (bt - bobAmp) * Math.min(1, dt * 6); bobPhase += view.moveSpeed * dt * Math.PI * 2 / (jog ? 1.0 : 0.5);
      camera.position.y += Math.abs(Math.sin(bobPhase * 0.5)) * bobAmp * 2 - bobAmp; camera.position.addScaledVector(right, Math.sin(bobPhase * 0.5) * bobAmp * 0.4);
    } else {
      view.moveSpeed = 0;
      controls.update();
      const g = groundH(camera.position.x, camera.position.z) + 2; if (camera.position.y < g) camera.position.y = g;
    }
  }

  return { setMode, update };
}
