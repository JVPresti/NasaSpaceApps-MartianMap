// Camera modes and input. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 785-808, 829-850).
//   walk: first person at eye height (the bench's 'eye' mode). Pointer lock is requested by the app shell
//         (Start / Resume) and released on pause or Plan; WASD / arrows to walk, Shift to jog. Drag to look
//         still works while the mouse is not locked, but only while input is enabled.
//   plan: the site from above (OrbitControls): right-drag to pan and scroll to zoom; rotation is disabled.
// Internally view.mode keeps the bench's values ('eye' | 'orbit') because the arms, legs and habitat check them.
//
// The input gate and the pointer-lock controller are plain modules (input.js, pointerLock.js), so the
// pause/menu rules are unit-tested without three.js.
// The look speed multiplier and the inverted vertical axis (#102) are applied to both locked and drag look.
import * as THREE from 'three';
import { addCircle, pushOut, PARTNER_GAP, WALKER_RADIUS } from './collide.js';
import { createInputGate } from './input.js';
import { createPointerLock } from './pointerLock.js';
import { LOOK_DEFAULTS, clampLookSettings } from './lookSettings.js';

// The test bench's start, 70 m south of Cheyava Falls in Neretva Vallis. Only a debug teleport now (__marswalk.cheyavaView,
// scripts/measure-fps.mjs): the EVA starts at the habitat airlock (spawn.js, placed by the engine once the habitat is down, #166).
export const CHEYAVA_VIEW = Object.freeze({ x: 8, z: 70, yaw: -0.11 });
const PLAN_MIN_HEIGHT = 1200;                         // enough to read the whole tile on a laptop screen
const NEAR = { eye: 0.15, orbit: 5 };
// Suited walking speeds from public/data/hazards.json: mobility.speed.flat and mobility.speed.jog (both SIM).
// The test bench used 1.4 and 4.5 m/s, faster than a suited astronaut and outside the suit model's range (#13, #19).
export const WALK_SPEED = 1.0, JOG_SPEED = 1.5;
const JOG_BOB_FROM = 1.25;        // m/s: above this the head bob switches to the jogging lope
const LOOK_LOCKED = 0.0025;       // rad per pixel of mouse movement while the pointer is locked
const LOOK_DRAG = 0.004;          // rad per pixel while dragging (the bench's value)
export const LOOK_PITCH_LIMIT = 1.2;   // rad: how far up and down the camera can look

export function createViewState() {
  return { mode: 'eye', yaw: 0, pitch: 0, eye: new THREE.Vector3(), keys: {}, moveSpeed: 0 };   // eye and yaw: set at the airlock during boot
}

/**
 * Applies one mouse-look delta. Locked and drag look share this, so the sensitivity and the inverted
 * vertical axis behave the same in both (#102). The signature of look() does not change.
 * @param {{ yaw: number, pitch: number }} view
 * @param {number} dx horizontal pixels (right positive)
 * @param {number} dy vertical pixels (down positive)
 * @param {number} k radians per pixel for this path (LOOK_LOCKED or LOOK_DRAG)
 * @param {{ sensitivity?: number, invertY?: boolean }} settings
 */
export function applyLook(view, dx, dy, k, settings = LOOK_DEFAULTS) {
  const sensitivity = Number.isFinite(settings?.sensitivity) ? settings.sensitivity : LOOK_DEFAULTS.sensitivity;
  const invert = settings?.invertY === true ? -1 : 1;
  view.yaw += dx * k * sensitivity;
  view.pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, view.pitch + dy * k * sensitivity * invert));
}

/**
 * @param {object} ctx engine context
 * @param {HTMLCanvasElement} canvas
 * @param {AbortSignal} signal
 * @param {{ onLockChange?: (locked: boolean) => void, inputEnabled?: boolean,
 *   document?: Document }} [options] onLockChange fires on pointer-lock changes only, never per frame
 */
export function createView(ctx, canvas, signal, { onLockChange = () => {}, inputEnabled = true, document: doc = globalThis.document } = {}) {
  const { camera, controls, view, sys } = ctx;
  const { meshH, groundH, tileH } = ctx.terrain;
  const { T } = ctx;
  const gate = createInputGate({ enabled: inputEnabled });
  view.keys = gate.keys;   // the debug hook and existing code read view.keys
  let input = inputEnabled === true;
  let drag = false, lx = 0, ly = 0, dragMoved = 0;

  const pointerLock = createPointerLock({
    document: doc,
    element: canvas,
    onChange: (isLocked) => { if (!isLocked) drag = false; onLockChange(isLocked); },
  });
  const locked = () => pointerLock.isLocked();
  const lookSettings = { ...LOOK_DEFAULTS };
  const look = (dx, dy, k) => applyLook(view, dx, dy, k, lookSettings);
  const applyControls = () => { controls.enabled = input && view.mode === 'orbit'; };

  addEventListener('keydown', (e) => { gate.keyDown(e.code); }, { signal });
  addEventListener('keyup', (e) => { gate.keyUp(e.code); }, { signal });
  addEventListener('blur', () => { gate.clear(); }, { signal });   // no stuck keys after alt-tab
  canvas.addEventListener('pointerdown', (e) => {
    if (!input || view.mode !== 'eye' || locked()) return;
    drag = true; dragMoved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointerup', () => { drag = false; }, { signal });
  canvas.addEventListener('pointercancel', () => { drag = false; }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!input || view.mode !== 'eye') return;
    if (locked()) { look(e.movementX, e.movementY, LOOK_LOCKED); return; }
    if (!drag) return;
    dragMoved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
    look(e.clientX - lx, e.clientY - ly, LOOK_DRAG); lx = e.clientX; ly = e.clientY;
  }, { signal });
  signal.addEventListener('abort', () => pointerLock.dispose(), { signal });

  function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }

  /** @param {'plan' | 'walk'} m */
  function setMode(m) {
    if (m === 'plan') {
      // Plan uses the mouse for panning. Releasing also cancels a Walk lock request the browser has not
      // answered yet, so a late grant cannot capture the pointer while the map is open.
      pointerLock.release();
      drag = false;
      view.mode = 'orbit';
      applyControls();
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
      applyControls();
      controls.enableRotate = true;
      controls.zoomToCursor = false;
      camera.up.set(0, 1, 0);
      setNear(NEAR.eye);
    }
  }

  /** Menus disable gameplay input; this also clears any key already held. */
  function setInputEnabled(enabled) {
    input = enabled === true;
    gate.setEnabled(input);
    if (!input) drag = false;
    applyControls();
  }

  /**
   * Look preference (#102). Copies the clamped values into the state look() reads, so it applies from the
   * next mouse movement without touching the current pose.
   * @param {{ sensitivity?: number, invertY?: boolean }} next
   */
  function setLookSettings(next) {
    const s = clampLookSettings(next);
    lookSettings.sensitivity = s.sensitivity;
    lookSettings.invertY = s.invertY;
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let bobAmp = 0, bobPhase = 0, camGround = 0, camDuck = 0, groundInit = false;
  const obs = [];   // this frame's obstacles near the walker (collide.js), reused

  function update(dt) {
    const { arms, rocks, partner, habitat } = sys;
    if (view.mode === 'eye') {
      const eye = view.eye, yaw = view.yaw;
      const sp = (input ? (gate.isDown('ShiftLeft') || gate.isDown('ShiftRight') ? JOG_SPEED : WALK_SPEED) : 0) * dt, ex = eye.x, ez = eye.z;
      fwd.set(Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
      if (gate.isDown('KeyW') || gate.isDown('ArrowUp')) eye.addScaledVector(fwd, sp);
      if (gate.isDown('KeyS') || gate.isDown('ArrowDown')) eye.addScaledVector(fwd, -sp);
      if (gate.isDown('KeyD') || gate.isDown('ArrowRight')) eye.addScaledVector(right, sp);
      if (gate.isDown('KeyA') || gate.isDown('ArrowLeft')) eye.addScaledVector(right, -sp);
      // collisions (#38, collide.js): rocks of 0.35 m and larger, the Cheyava Falls rock and the partner push the walker out, in one solve
      // so a walker squeezed between two of them ends clear of both. Then the habitat walls, last and hard: a blocked step slides along
      // the wall, and no push can shove the walker through one. Also while an arm clip plays: a clip moves only the camera (arms.cam).
      // The solve runs only while the player can move; otherwise a walking partner or a pushed rock could move a paused astronaut.
      if (input) {
        obs.length = 0; rocks.obstacles(eye, obs); if (partner.root && partner.root.visible) addCircle(obs, partner.root.position.x, partner.root.position.z, PARTNER_GAP - WALKER_RADIUS);
        pushOut(eye, obs, WALKER_RADIUS); habitat.slide(ex, ez, eye);
        eye.x = Math.max(-T.W / 2 + 3, Math.min(T.W / 2 - 3, eye.x)); eye.z = Math.max(-T.H / 2 + 3, Math.min(T.H / 2 - 3, eye.z));
      }
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
      if (input) controls.update();
      const g = groundH(camera.position.x, camera.position.z) + 2; if (camera.position.y < g) camera.position.y = g;
    }
  }

  /**
   * Return to the spawn pose after a restart (the airlock, spawn.js, #166).
   * @param {{ x: number, z: number, yaw: number }} pose
   * @param {'plan' | 'walk'} mode
   */
  function reset(pose, mode) {
    view.eye.set(pose.x, 0, pose.z);
    view.yaw = pose.yaw;
    view.pitch = 0;
    view.moveSpeed = 0;
    gate.clear();
    drag = false;
    bobAmp = 0; bobPhase = 0; camGround = 0; camDuck = 0; groundInit = false;
    pointerLock.release();
    setMode(mode);
    update(0);   // snap the camera to the new eye position before the next frame
  }

  return {
    setMode,
    update,
    setInputEnabled,
    setLookSettings,
    reset,
    requestPointerLock: () => pointerLock.request(),
    releasePointerLock: () => pointerLock.release(),
    isPointerLocked: () => pointerLock.isLocked(),
    dispose: () => pointerLock.dispose(),
  };
}
