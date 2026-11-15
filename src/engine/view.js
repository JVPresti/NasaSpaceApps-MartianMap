// Camera modes and input. Ported from docs/marswalk-assets/testbench-reference/main.js (lines 785-808, 829-850).
//   walk: first person at eye height (the bench's 'eye' mode). Pointer lock is requested by the app shell
//         (Start / Resume) and released on pause or Plan; WASD / arrows to walk, Shift to jog. Drag to look
//         still works while the mouse is not locked, but only while input is enabled. On touch screens a
//         virtual stick in the bottom-left corner walks (push further to jog) and any other finger looks
//         (#103, touchInput.js); a standard gamepad moves with the left stick, looks with the right one,
//         jogs with L3 and reports Start/LB/RB as actions (#103, gamepadInput.js).
//   plan: the site from above (OrbitControls): right-drag to pan and scroll to zoom; rotation is disabled and
//         touch pans with one finger and pans/pinch-zooms with two (index.js, planTouch.js).
// Internally view.mode keeps the bench's values ('eye' | 'orbit') because the arms, legs and habitat check them.
//
// The input gate, the pointer-lock controller, the touch stick and the gamepad reader are plain modules
// (input.js, pointerLock.js, touchInput.js, gamepadInput.js), so the pause/menu rules are unit-tested without three.js.
import * as THREE from 'three';
import { addCircle, pushOut, PARTNER_GAP, WALKER_RADIUS } from './collide.js';
import { createGamepadPoller } from './gamepadInput.js';
import { createInputGate } from './input.js';
import { createPointerLock } from './pointerLock.js';
import { createTouchControls } from './touchInput.js';
import { walkVector } from './walkVector.js';

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
const LOOK_PAD = 2.2;             // rad per second at full right-stick deflection

export function createViewState() {
  return { mode: 'eye', yaw: 0, pitch: 0, eye: new THREE.Vector3(), keys: {}, moveSpeed: 0 };   // eye and yaw: set at the airlock during boot
}

/**
 * @param {object} ctx engine context
 * @param {HTMLCanvasElement} canvas
 * @param {AbortSignal} signal
 * @param {{ onLockChange?: (locked: boolean) => void, inputEnabled?: boolean,
 *   onTouch?: (state: { visible: boolean, active: boolean, knobX: number, knobY: number, jog: boolean }) => void,
 *   onGamepad?: (state: { used: boolean, connected: boolean }) => void,
 *   onGamepadAction?: (action: 'mode' | 'layer-prev' | 'layer-next') => void,
 *   document?: Document }} [options] onLockChange fires on pointer-lock changes only, never per frame; onTouch fires
 *   only on touch events; onGamepad fires on the first gamepad use; onGamepadAction fires once per button press
 */
export function createView(ctx, canvas, signal, {
  onLockChange = () => {},
  inputEnabled = true,
  onTouch = () => {},
  onGamepad = () => {},
  onGamepadAction = () => {},
  document: doc = globalThis.document,
} = {}) {
  const { camera, controls, view, sys } = ctx;
  const { meshH, groundH, tileH } = ctx.terrain;
  const { T } = ctx;
  const gate = createInputGate({ enabled: inputEnabled });
  view.keys = gate.keys;   // the debug hook and existing code read view.keys
  let input = inputEnabled === true;
  let drag = false, lx = 0, ly = 0, dragMoved = 0;
  const touch = createTouchControls();
  const pad = createGamepadPoller();
  let padConnected = false;
  let touchLeft = 0, touchTop = 0;   // canvas origin, cached on touch down so moves stay in one coordinate frame

  const pointerLock = createPointerLock({
    document: doc,
    element: canvas,
    onChange: (isLocked) => { if (!isLocked) drag = false; onLockChange(isLocked); },
  });
  const locked = () => pointerLock.isLocked();
  const look = (dx, dy, k) => { view.yaw += dx * k; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + dy * k)); };
  const applyControls = () => { controls.enabled = input && view.mode === 'orbit'; };
  const publishTouch = () => { onTouch(touch.state()); };
  // Pointer capture keeps a drag alive outside the canvas. It is an optimisation, so a refused or unknown
  // pointer id must not abort the handler (synthetic pointers in tests, and some browsers on odd devices).
  const capturePointer = (pointerId) => { try { canvas.setPointerCapture(pointerId); } catch { /* not capturable */ } };

  addEventListener('keydown', (e) => { gate.keyDown(e.code); }, { signal });
  addEventListener('keyup', (e) => { gate.keyUp(e.code); }, { signal });
  addEventListener('blur', () => { gate.clear(); }, { signal });   // no stuck keys after alt-tab
  // Touch is read from Touch Events, not Pointer Events: while the mouse pointer is locked (a touchscreen laptop
  // that started with the mouse), Chrome reports clientX/clientY = 0 on every touch Pointer Event, but Touch
  // Events keep the real viewport coordinates. Touch Events are also the only path on iOS, where there is no
  // pointer lock (#197). The touch point's identifier is used as the pointer id inside the stick controller.
  canvas.addEventListener('touchstart', (e) => {
    if (!input || view.mode !== 'eye') return;
    e.preventDefault();                       // also suppresses the compatibility mouse events
    const box = canvas.getBoundingClientRect();
    touchLeft = box.left; touchTop = box.top;
    // Array.from keeps this working on browsers whose TouchList is only array-like, like older Safari.
    for (const t of Array.from(e.changedTouches ?? [])) {
      touch.down({
        pointerId: t.identifier, x: t.clientX - box.left, y: t.clientY - box.top,
        pointerType: 'touch', viewport: { width: box.width, height: box.height },
      });
    }
    publishTouch();
  }, { passive: false, signal });
  canvas.addEventListener('touchmove', (e) => {
    if (!input || view.mode !== 'eye') return;
    e.preventDefault();
    let changed = false;
    for (const t of Array.from(e.changedTouches ?? [])) {
      changed = touch.move({ pointerId: t.identifier, x: t.clientX - touchLeft, y: t.clientY - touchTop }).changed || changed;
    }
    if (changed) publishTouch();
  }, { passive: false, signal });
  const touchEnd = (e) => {
    if (!input || view.mode !== 'eye') return;
    e.preventDefault();
    let changed = false;
    for (const t of Array.from(e.changedTouches ?? [])) changed = touch.up(t.identifier).changed || changed;
    if (changed) publishTouch();
  };
  canvas.addEventListener('touchend', touchEnd, { passive: false, signal });
  canvas.addEventListener('touchcancel', touchEnd, { passive: false, signal });
  canvas.addEventListener('pointerdown', (e) => {
    if (!input || view.mode !== 'eye' || e.pointerType === 'touch') return;   // touch: see touchstart
    if (e.pointerType === 'pen') {
      const box = canvas.getBoundingClientRect();
      touchLeft = box.left; touchTop = box.top;
      const result = touch.down({
        pointerId: e.pointerId, x: e.clientX - box.left, y: e.clientY - box.top,
        pointerType: e.pointerType, viewport: { width: box.width, height: box.height },
      });
      if (result.claimed || result.look) { capturePointer(e.pointerId); publishTouch(); e.preventDefault(); }
      return;
    }
    if (locked()) return;
    drag = true; dragMoved = 0; lx = e.clientX; ly = e.clientY; capturePointer(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;   // touch roles are released by touchend
    if (touch.owns(e.pointerId)) { touch.up(e.pointerId); publishTouch(); }
    drag = false;
  }, { signal });
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') return;
    if (touch.owns(e.pointerId)) { touch.cancel(e.pointerId); publishTouch(); }
    drag = false;
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!input || view.mode !== 'eye') return;
    if (e.pointerType === 'touch') return;   // touch: see touchmove
    if (touch.owns(e.pointerId)) {
      if (touch.move({ pointerId: e.pointerId, x: e.clientX - touchLeft, y: e.clientY - touchTop }).changed) publishTouch();
      return;
    }
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
      // A finger still on the stick when Plan opens must not keep walking in the background.
      touch.clear(); publishTouch();
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

  /** Menus disable gameplay input; this also clears any key already held and drops a touch in progress. */
  function setInputEnabled(enabled) {
    input = enabled === true;
    gate.setEnabled(input);
    if (!input) drag = false;
    // Touch and gamepad state is dropped, not paused: releasing a menu must not resume a stick that was left
    // deflected, and a button held through the pause must not fire again on resume (#103).
    touch.clear(); pad.reset(); publishTouch();
    applyControls();
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let bobAmp = 0, bobPhase = 0, camGround = 0, camDuck = 0, groundInit = false;
  const obs = [];   // this frame's obstacles near the walker (collide.js), reused

  /**
   * Poll the gamepad once per frame while input is on. Button presses are edges, so each one reaches the app
   * exactly once; the first use is what makes the on-screen hint appear.
   */
  function pollGamepad() {
    const reading = pad.poll();
    padConnected = reading.connected;
    for (const action of reading.actions) onGamepadAction(action);
    if (reading.firstUse) onGamepad({ used: true, connected: reading.connected });
    return reading;
  }

  function update(dt) {
    const { arms, rocks, partner, habitat } = sys;
    const padReading = input ? pollGamepad() : null;
    if (view.mode === 'eye') {
      const eye = view.eye, yaw = view.yaw;
      const ex = eye.x, ez = eye.z;
      // Touch look is consumed once per frame, so a fast drag cannot apply twice in one frame.
      const dragLook = input ? touch.consumeLook() : { dx: 0, dy: 0 };
      if (input && (dragLook.dx !== 0 || dragLook.dy !== 0)) look(dragLook.dx, dragLook.dy, LOOK_DRAG);
      if (padReading && (padReading.lookX !== 0 || padReading.lookY !== 0)) {
        look(padReading.lookX * LOOK_PAD * dt, padReading.lookY * LOOK_PAD * dt, 1);
      }
      fwd.set(Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
      // One speed vector per frame. The keyboard keeps its exact old mapping (WASD/arrows at WALK_SPEED, Shift at
      // JOG_SPEED, diagonals unnormalised); touch and gamepad add an analogue vector of magnitude 0..1 times the
      // walking or jog speed. While an analogue source is active the sum is capped at JOG_SPEED, so no input can
      // outrun Shift and the suit model's numbers stay valid (#103).
      const keySpeed = input ? (gate.isDown('ShiftLeft') || gate.isDown('ShiftRight') ? JOG_SPEED : WALK_SPEED) : 0;
      const keyX = (gate.isDown('KeyD') || gate.isDown('ArrowRight') ? 1 : 0) - (gate.isDown('KeyA') || gate.isDown('ArrowLeft') ? 1 : 0);
      const keyY = (gate.isDown('KeyW') || gate.isDown('ArrowUp') ? 1 : 0) - (gate.isDown('KeyS') || gate.isDown('ArrowDown') ? 1 : 0);
      const stick = touch.velocity();
      const analogueJog = stick.jog || (padReading ? padReading.jog : false);
      const { x: vx, y: vy } = walkVector({
        keyX, keyY, keySpeed,
        anaX: stick.x + (padReading ? padReading.moveX : 0),
        anaY: stick.y + (padReading ? padReading.moveY : 0),
        anaSpeed: analogueJog ? JOG_SPEED : WALK_SPEED,
        maxSpeed: JOG_SPEED,
      });
      if (vx !== 0 || vy !== 0) {
        eye.addScaledVector(fwd, vy * dt);
        eye.addScaledVector(right, vx * dt);
      }
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
    touch.clear(); pad.reset(); publishTouch();
    bobAmp = 0; bobPhase = 0; camGround = 0; camDuck = 0; groundInit = false;
    pointerLock.release();
    setMode(mode);
    update(0);   // snap the camera to the new eye position before the next frame
  }

  return {
    setMode,
    update,
    setInputEnabled,
    reset,
    /** Touch stick state for the overlay (src/components/TouchStick.jsx); changes only on touch events. */
    touchState: () => touch.state(),
    /** Whether a gamepad has been used and is currently connected, for the one-time hint. */
    gamepadState: () => ({ used: pad.isUsed(), connected: padConnected }),
    requestPointerLock: () => pointerLock.request(),
    releasePointerLock: () => pointerLock.release(),
    isPointerLocked: () => pointerLock.isLocked(),
    dispose: () => pointerLock.dispose(),
  };
}
