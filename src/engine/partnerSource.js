/**
 * Partner sources. The engine draws the partner astronaut only from what a source returns each frame, so a scripted
 * partner and a network-driven one (#53) are interchangeable. Contract and decision: docs/PARTNER.md.
 *
 * Plain JavaScript: no three.js, no React. Coordinates: x east, z south, metres from Cheyava Falls.
 * Yaw is the model's rotation about y: 0 faces +z (south), atan2(dx, dz) faces a point dx, dz away.
 *
 * A source is { id, color, update(dtSec, world) -> PartnerState, command?(name, world) -> boolean }.
 * world = { player: { x, z }, habitat: { x, z, yaw } | null, duck(x, z) -> metres of stoop (0 when none) }.
 */

/** The case clip in z2_astronaut.glb (assets_astronaut/astronaut.json, animations.case_set_down). */
export const CASE_CLIP = Object.freeze({ name: 'case_set_down', seconds: 2.07, releaseAt: 0.9 });

/** Case hand-over: the scripted partner sets the case down this far from the player (m)... */
export const HANDOVER_M = 1.6;
/** ...and bends at once, without walking, when the player is already this close (m). */
export const HANDOVER_REACH_M = 1.7;

/** Throws if a state does not match the PartnerState contract. Network sources can use it in their tests. */
export function assertPartnerState(s) {
  const fail = (m) => { throw new Error('invalid PartnerState: ' + m); };
  if (!s || typeof s !== 'object') fail('not an object');
  if (typeof s.visible !== 'boolean') fail('visible must be a boolean');
  for (const k of ['x', 'z', 'yaw', 'speedMs']) if (!Number.isFinite(s[k])) fail(k + ' must be a finite number');
  if (s.gait !== 'walk' && s.gait !== 'idle') fail('gait must be walk or idle');
  if (typeof s.carrying !== 'boolean') fail('carrying must be a boolean');
  if (s.action !== null) {
    if (!s.action || typeof s.action.name !== 'string' || !Number.isFinite(s.action.timeSec)) fail('action must be null or { name, timeSec }');
    if (typeof s.action.carryingAfter !== 'boolean') fail('action.carryingAfter must be a boolean');
  }
  if (s.lampOn !== undefined && typeof s.lampOn !== 'boolean') fail('lampOn must be a boolean or undefined');
  return s;
}

/** A source that holds one pose: useful for tests and as the shape of a network source (latest received state). */
export function createStaticPartner({ id = 'EV2', color = [1, 0.32, 0.03], x = 0, z = 0, yaw = 0, carrying = true } = {}) {
  const state = { visible: true, x, z, yaw, gait: 'idle', speedMs: 0, action: null, carrying, lampOn: undefined };
  return { id, color, update: () => state, set(patch) { Object.assign(state, patch); } };
}

/**
 * The scripted partner of the test bench (main.js, partner, lines 388-464), moved out of the renderer:
 * a patrol between A and B with 3 s pauses, the case hand-over, and the walk into the habitat and back.
 * The bend is timed here from CASE_CLIP instead of from the animation mixer.
 */
export function createScriptedPartner({ id = 'EV2', color = [1, 0.32, 0.03], A = { x: 14, z: 58 }, B = { x: 5, z: 12 } } = {}) {
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  let t = 0, dir = 1, pause = 0;          // patrol: position along A-B, direction, pause left
  let free = null;                        // off the patrol: { x, z, goal, queue, face, then, leave, follow }
  let yaw = Math.atan2(B.x - A.x, B.z - A.z);
  let carrying = true, wantCarry = true;  // wantCarry: what carrying becomes at the release point of the bend
  let bendTime = null;                    // seconds into the case clip while bending
  let inside = false, stoop = 0, moving = true;
  let last = null;
  const patrolPoint = () => ({ x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t });
  const startBend = () => { bendTime = 0; };

  // Down: walk to HANDOVER_M from the player, face them, bend and release (0.9 s). Up: bend and grab, walk back.
  // The walk follows the player (follow: true): update() re-aims it every frame at where the player is now (#172).
  function toggleCase(world) {
    if (bendTime !== null || (free && (free.goal || free.then))) return false;
    const p = last || patrolPoint();
    if (carrying) {
      const px = world.player.x, pz = world.player.z, dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz) || 1;
      wantCarry = false;
      free = {
        x: p.x, z: p.z, face: { x: px, z: pz }, follow: true,
        goal: d > HANDOVER_REACH_M ? { x: px + dx / d * HANDOVER_M, z: pz + dz / d * HANDOVER_M } : null,
        then: () => { free.follow = false; startBend(); },
      };
    } else { wantCarry = true; startBend(); }
    return true;
  }

  function visitHabitat(world) {   // waypoints in habitat space: x toward the airlock end, v sideways
    const h = world.habitat;
    if (bendTime !== null || !h || (free && (free.goal || free.then || (free.queue && free.queue.length)))) return false;
    const c = Math.cos(h.yaw), sn = Math.sin(h.yaw), W = (x, v) => ({ x: h.x + x * c + v * sn, z: h.z - x * sn + v * c });
    const way = [[11.4, 0], [9.95, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.4, 0.15], [1.25, 0.55]].map((q) => W(q[0], q[1]));
    const p = last || patrolPoint();
    if (!inside) { free = { x: p.x, z: p.z, goal: way[0], queue: way.slice(1), face: W(0, 0) }; inside = true; }
    else { const back = way.slice(0, -1).reverse(); free = { x: p.x, z: p.z, goal: back[0], queue: back.slice(1).concat([patrolPoint()]), leave: true }; inside = false; }
    return true;
  }

  function update(dt, world) {
    // the case clip: release or grab at 0.9 s, back to the patrol when it ends
    if (bendTime !== null) {
      bendTime += dt;
      if (bendTime >= CASE_CLIP.releaseAt && carrying !== wantCarry) carrying = wantCarry;
      if (bendTime >= CASE_CLIP.seconds) {
        bendTime = null;
        if (carrying && free) { free.face = null; free.goal = patrolPoint(); free.then = () => { free = null; }; }
      }
    }
    const duck = world && world.duck ? world.duck : () => 0;
    const speed = (1.0 / 1.2) * (1 - 0.45 * stoop);   // one 1 m stride per 1.2 s walk loop; slower when stooped
    let walking = true, x, z, target = null, turn = 6;
    if (free) {   // off the patrol: walk to a goal, then face a point, then act
      const f = free;
      if (f.follow && world && world.player) {   // bringing the case: aim at the player as they are now, not as they were (#172)
        const px = world.player.x, pz = world.player.z, dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
        f.face = { x: px, z: pz };
        // still walking: re-aim at the HANDOVER_M ring around the player. Already on or inside it (the player walked up): stop
        // here, never back away. Once stopped it stays stopped and turns to face the player until the bend starts.
        if (f.goal) f.goal = d > HANDOVER_M ? { x: px + dx / d * HANDOVER_M, z: pz + dz / d * HANDOVER_M } : null;
      }
      if (f.goal) {
        const gx = f.goal.x - f.x, gz = f.goal.z - f.z, gd = Math.hypot(gx, gz), st = speed * dt;
        if (gd <= st) { f.x = f.goal.x; f.z = f.goal.z; f.goal = f.queue && f.queue.length ? f.queue.shift() : null; if (!f.goal && f.leave) free = null; }
        else { f.x += gx / gd * st; f.z += gz / gd * st; target = Math.atan2(gx, gz); }
      } else { walking = false; if (f.face) { target = Math.atan2(f.face.x - f.x, f.face.z - f.z); turn = 4; } }
      x = f.x; z = f.z;
    }
    if (!free) {
      if (pause > 0) { pause -= dt; walking = false; if (pause <= 0) dir *= -1; }
      else { t += dir * speed * dt / len; if (t >= 1 || t <= 0) { t = Math.max(0, Math.min(1, t)); pause = 3; } }
      ({ x, z } = patrolPoint());
      const d = pause > 0 ? -dir : dir; target = Math.atan2((B.x - A.x) * d, (B.z - A.z) * d); if (pause > 0) turn = 1.2;
    }
    if (bendTime !== null) walking = false;
    stoop += ((duck(x, z) > 0.15 ? 1 : 0) - stoop) * Math.min(1, dt * 5);
    let aligned = true;
    if (target !== null && bendTime === null) { const df = ((target - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw += df * Math.min(1, dt * turn); aligned = Math.abs(df) < 0.12; }
    if (free && !free.goal && aligned && free.then) { const fn = free.then; free.then = null; fn(); }
    moving = walking;
    last = { x, z };
    return {
      visible: true, x, z, yaw,
      gait: moving ? 'walk' : 'idle',
      speedMs: moving ? speed : 0,
      action: bendTime !== null ? { name: CASE_CLIP.name, timeSec: bendTime, carryingAfter: wantCarry } : null,
      carrying,
      lampOn: undefined,
    };
  }

  return {
    id, color, update,
    command(name, world) {
      if (name === 'toggleCase') return toggleCase(world);
      if (name === 'visitHabitat') return visitHabitat(world);
      return false;
    },
  };
}
