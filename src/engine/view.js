// Camera modes and input. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 785-808, 829-850).
//   walk: first person at eye height (the bench's 'eye' mode). Click to lock the mouse and look around, Esc to release;
//         WASD / arrows to walk, Shift to jog. Drag to look still works while the mouse is not locked (fallback).
//   plan: the site from above (OrbitControls): right-drag to pan and scroll to zoom; rotation is disabled.
// Internally view.mode keeps the bench's values ('eye' | 'orbit') because the arms, legs and habitat check them.
import * as THREE from 'three';

export const START = new THREE.Vector3(8, 0, 70);   // 70 m south of Cheyava Falls, in Neretva Vallis
const PLAN_MIN_HEIGHT = 1200;                         // enough to read the whole tile on a laptop screen
const NEAR = { eye: 0.15, orbit: 5 };
// Suited walking speeds from public/data/hazards.json: mobility.speed.flat and mobility.speed.jog (both SIM).
// The test bench used 1.4 and 4.5 m/s, faster than a suited astronaut and outside the suit model's range (#13, #19).
export const WALK_SPEED = 1.0, JOG_SPEED = 1.5;
const JOG_BOB_FROM = 1.25;        // m/s: above this the head bob switches to the jogging lope
const LOOK_LOCKED = 0.0025;       // rad per pixel of mouse movement while the pointer is locked
const LOOK_DRAG = 0.004;          // rad per pixel while dragging (the bench's value)

export function createViewState() {
  return { mode: 'eye', yaw: -0.11, pitch: 0, eye: START.clone(), keys: {}, moveSpeed: 0 };
}

/** @param {{ onLockChange?: (locked: boolean) => void }} [options] onLockChange fires on pointer-lock changes only, never per frame */
export function createView(ctx, canvas, signal, { onLockChange = () => {} } = {}) {
  const { camera, controls, view, sys } = ctx;
  const { meshH, groundH, tileH } = ctx.terrain;
  const { T } = ctx;
  const keys = view.keys;
  let drag = false, lx = 0, ly = 0, dragMoved = 0;
  const locked = () => document.pointerLockElement === canvas;
  const look = (dx, dy, k) => { view.yaw += dx * k; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * k)); };

  addEventListener('keydown', (e) => { keys[e.code] = true; }, { signal });
  addEventListener('keyup', (e) => { keys[e.code] = false; }, { signal });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; }, { signal });   // no stuck keys after alt-tab
  canvas.addEventListener('pointerdown', (e) => {
    if (locked()) return;
    drag = true; dragMoved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointerup', () => { drag = false; }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (view.mode !== 'eye') return;
    if (locked()) { look(e.movementX, e.movementY, LOOK_LOCKED); return; }
    if (!drag) return;
    dragMoved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
    look(e.clientX - lx, e.clientY - ly, LOOK_DRAG); lx = e.clientX; ly = e.clientY;
  }, { signal });
  // a click (not the end of a drag) in Walk mode locks the mouse; Esc releases it (the browser handles Esc)
  canvas.addEventListener('click', () => {
    if (view.mode !== 'eye' || locked() || dragMoved > 4) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* not supported: drag to look */ }
  }, { signal });
  document.addEventListener('pointerlockchange', () => { if (!locked()) drag = false; onLockChange(locked()); }, { signal });
  document.addEventListener('pointerlockerror', () => onLockChange(false), { signal });
  signal.addEventListener('abort', () => { if (locked()) document.exitPointerLock(); });

  function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }

  /** @param {'plan' | 'walk'} m */
  function setMode(m) {
    if (m === 'plan') {
      if (locked()) document.exitPointerLock();   // Plan uses the mouse for panning
      view.mode = 'orbit';
      controls.enabled = true;
      controls.enableRotate = false;      // Plan is a map: pan and zoom only
      controls.zoomToCursor = true;
      setNear(NEAR.orbit);
      // Look straight down with north up. A tiny south offset keeps the
      // camera basis well-defined; camera.up carries north so panning stays
      // aligned with the map. The height fits the whole tile for this aspect.
      camera.up.set(0, 0, -1);
      const halfFov = Math.tan((camera.fov * Math.PI) / 360);
      const fitDepth = T.H / 2 / halfFov;
      const fitWidth = T.W / 2 / (halfFov * Math.max(0.2, camera.aspect));
      const planHeight = Math.max(PLAN_MIN_HEIGHT, fitDepth, fitWidth) * 1.12;
      const h0 = tileH(0, 0);
      camera.position.set(0, h0 + planHeight, 0.001);
      controls.target.set(0, h0, 0);
      controls.update();
    } else {
      // walk keeps the position and heading the player had when they left it
      view.mode = 'eye';
      controls.enabled = false;
      controls.enableRotate = true;
      controls.zoomToCursor = false;
      camera.up.set(0, 1, 0);
      setNear(NEAR.eye);
    }
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let bobAmp = 0, bobPhase = 0, camGround = 0, camDuck = 0, groundInit = false;

  function update(dt) {
    const { arms, rocks, partner, habitat } = sys;
    if (view.mode === 'eye') {
      const eye = view.eye, yaw = view.yaw;
      const sp = (keys.ShiftLeft || keys.ShiftRight ? JOG_SPEED : WALK_SPEED) * dt, ex = eye.x, ez = eye.z;
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
      const jog = view.moveSpeed > JOG_BOB_FROM, bt = arms.clip ? 0 : view.moveSpeed > 0.1 ? (jog ? 0.045 : 0.012) : 0; bobAmp += (bt - bobAmp) * Math.min(1, dt * 6); bobPhase += view.moveSpeed * dt * Math.PI * 2 / (jog ? 1.0 : 0.5);
      camera.position.y += Math.abs(Math.sin(bobPhase * 0.5)) * bobAmp * 2 - bobAmp; camera.position.addScaledVector(right, Math.sin(bobPhase * 0.5) * bobAmp * 0.4);
    } else {
      view.moveSpeed = 0;
      controls.update();
      const g = groundH(camera.position.x, camera.position.z) + 2; if (camera.position.y < g) camera.position.y = g;
    }
  }

  return { setMode, update };
}
