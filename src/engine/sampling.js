// Sampling (#36): connects the ready arm clips, the scoop and the partner's case to the player's input in Walk mode.
//   Click   take a sample of what the crosshair is on, within reach: Cheyava Falls, the Bright Angel outcrop or a loose rock (collect_rock, chips)
//           or the ground (collect_ground, soil). Ignored while a clip plays or while the scoop is full.
//   P       photograph the target with the helmet camera (the checklist's photo step)
//   E       stow the sample in the sample bag (stow_sample)
//   F       the hand-over (props.json "hand_over"): ask the partner to set the case down, pour into it (pour_sample),
//           and the partner closes the lid and takes the case back by itself
// The clips, the scoop contents and the spill already exist (arms.js, props.js, partner.js); this file only decides when
// they play and where the player stands, and reports what happened. Pure rules and tests: samplingRules.js.
import * as THREE from 'three';
import { CELL } from './rocks.js';
import { JOG_SPEED } from './view.js';
import { wristIsOpen } from './wrist.js';
import {
  BRIGHT_ANGEL, CASE_REACH_M, CASE_STAND_M, CHEYAVA_FALLS, GROUND_STAND_M, MIN_ROCK_D_M, PHOTO_RANGE_M, ROCK_STAND_M,
  angleDelta, caseState, classifyTarget, horizontalDistance, inputActions, marchGround, pickRock, pourStand, rayCylinder, raySphere, standPoint,
} from './samplingRules.js';

const KEYS = { KeyP: 'photo', KeyE: 'stow', KeyF: 'case' };
const PARTNER_R = 0.35, PARTNER_H = 1.9, CASE_R = 0.24;   // m: the partner as an upright cylinder, the case body as a sphere
const STEP_IN_SPEED = JOG_SPEED;   // m/s: how fast the player steps to the stand point at the start of a clip
const CLIP_OF = { rock: 'collect_rock', ground: 'collect_ground' };
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {object} ctx engine context (index.js); needs ctx.cheyava and the arms, props, partner, rocks and habitat systems
 * @param {HTMLCanvasElement} canvas the engine's canvas (clicks)
 * @param {AbortSignal} signal removes the listeners on dispose
 */
export function createSampling(ctx, canvas, signal) {
  const { camera, view, sys } = ctx;
  const { meshH } = ctx.terrain;
  const listeners = new Set();
  const ray = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), h = new THREE.Vector3();
  let phase = 'idle', sample = null, seq = 0;           // sample: { id, kind, site, x, z } of what is in the scoop
  let stand = null, pin = null;                         // where the player stands during the clip, and where they were last frame
  let shown = false, secured = false;                   // this clip: the scoop showed its content / the sample left the scoop
  let landing = null, sealing = null, caseRequested = false;   // hand-over: sample falling into the case, case to close, case asked for

  const emit = (type, extra) => { const e = { type, ...extra }; for (const fn of listeners) { try { fn(e); } catch (err) { console.error(err); } } };
  const walk = () => view.mode === 'eye';
  // #67: while the wrist app is up it owns the input (the interface reads its own keys and clicks). Sampling ignores
  // act() and reports every action as unavailable, but its phase is left exactly as it was, clips included.
  const wristUp = () => wristIsOpen(sys.arms && sys.arms.state);
  const onHabitat = (x, z) => { const hb = sys.habitat; return !!hb.root && (!!hb.zone(x, z) || !hb.canStand(x, z)); };
  const partnerHere = () => { const p = sys.partner; return !!(p && p.root && p.root.visible && sys.props.hand); };

  // loose rocks big enough to chip near a point: the same deterministic rocks rocks.js draws and collides with, as spheres
  function nearbyRocks(x, z) {
    const R = sys.rocks, out = [];
    if (!R.enabled) return out;
    const add = (c) => { for (let i = 0; i < c.n; i++) {
      const rx = c.meta[i * 4], rz = c.meta[i * 4 + 1], D = c.meta[i * 4 + 2];
      if (D < MIN_ROCK_D_M || Math.abs(rx - x) > PHOTO_RANGE_M + D || Math.abs(rz - z) > PHOTO_RANGE_M + D) continue;
      const hgt = R.heights[c.meta[i * 4 + 3]] * D;
      out.push({ x: rx, z: rz, y: meshH(rx, rz) + hgt * 0.35, r: Math.max(D * 0.45, hgt * 0.5) });
    } };
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) add(R.cell(2, cx + i, cz + j));
    if (R.large) add(R.large);
    return out;
  }

  // what the crosshair is on: the nearest of Cheyava Falls, a loose rock or the ground, up to the photo range
  function aim() {
    if (!walk() || wristUp() || onHabitat(view.eye.x, view.eye.z)) return null;
    camera.updateMatrixWorld(); camera.getWorldPosition(o); camera.getWorldDirection(d);
    const hits = [];
    ray.set(o, d); ray.far = PHOTO_RANGE_M;
    for (const [mesh, site] of [[ctx.cheyava, CHEYAVA_FALLS], [ctx.outcrop, BRIGHT_ANGEL]]) {   // the named rocks: their real meshes
      const hit = mesh ? ray.intersectObject(mesh, false)[0] : null;
      if (hit) hits.push({ kind: 'rock', site, distance: hit.distance, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } });
    }
    const rock = pickRock(o, d, nearbyRocks(o.x, o.z), PHOTO_RANGE_M);
    if (rock) hits.push({ kind: 'rock', site: null, distance: rock.distance, point: rock.point, rock: rock.rock });
    const ground = marchGround(o, d, meshH, PHOTO_RANGE_M);
    if (ground) hits.push({ kind: 'ground', site: null, distance: ground.distance, point: ground.point });
    if (partnerHere()) {   // the partner and the case hide what is behind them (an upright cylinder and a sphere, enough for aiming)
      const p = sys.partner.root.position, c = sys.props.tcase.position;
      hits.push({ kind: 'partner', distance: rayCylinder(o, d, p, PARTNER_R, PARTNER_H) ?? Infinity });
      if (sys.props.tcase.visible) hits.push({ kind: 'case', distance: raySphere(o, d, { x: c.x, y: c.y - 0.15, z: c.z }, CASE_R) ?? Infinity });
    }
    const t = classifyTarget(hits, view.eye);
    return t && !onHabitat(t.point.x, t.point.z) ? t : null;
  }

  function situation() {
    const p = sys.partner, present = partnerHere();
    if (caseRequested && (!present || !p.carrying)) caseRequested = false;   // the case is down (or the partner left)
    const cs = caseState({ present, carrying: !!p.carrying, bending: !!p.bending, wantCarry: !!p.wantCarry, requested: caseRequested });
    const caseInReach = cs === 'down' && horizontalDistance(view.eye, sys.props.tcase.position) <= CASE_REACH_M;
    const target = phase === 'idle' || phase === 'holding' ? aim() : null;
    return { walk: walk() && !wristUp(), phase, target, caseState: cs, caseInReach };
  }

  // feet 0.70 m from the rock face, facing it. Cheyava Falls: find the face as the bench does, with level rays 0.30, 0.20
  // and 0.12 m above its base toward the clicked point; a loose rock: its sphere; the Bright Angel outcrop: the clicked point
  function rockStand(t) {
    if (t.rock) return standPoint(view.eye, t.rock, t.rock.r + ROCK_STAND_M);
    if (t.site !== CHEYAVA_FALLS) return standPoint(view.eye, t.point, ROCK_STAND_M);
    const dx = t.point.x - view.eye.x, dz = t.point.z - view.eye.z, len = Math.hypot(dx, dz) || 1, base = ctx.cheyava.position.y + 0.06;
    d.set(dx / len, 0, dz / len); ctx.cheyava.updateMatrixWorld(true);
    for (const up of [0.30, 0.20, 0.12]) {
      ray.set(h.set(view.eye.x - d.x * 2, base + up, view.eye.z - d.z * 2), d); ray.far = 8;
      const hit = ray.intersectObject(ctx.cheyava, false)[0];
      if (hit) return standPoint(view.eye, hit.point, ROCK_STAND_M);
    }
    return standPoint(view.eye, t.point, ROCK_STAND_M);
  }

  function play(name, where) {
    const arms = sys.arms;
    if (!arms.clips || arms.clip) return false;
    arms.play(name);
    if (!arms.clip || arms.clipName !== name) return false;
    stand = where && !onHabitat(where.x, where.z) ? where : { x: view.eye.x, z: view.eye.z, yaw: where ? where.yaw : null };
    pin = { x: view.eye.x, z: view.eye.z }; shown = false; secured = false;
    return true;
  }

  /** Runs one input ('click' | 'photo' | 'stow' | 'case'). Returns the action taken, or null when the input does nothing now. */
  function act(input) {
    if (wristUp()) return null;   // the wrist app has the input; no clip, no pose and no phase change from sampling
    const s = situation(), action = inputActions(s)[input], t = s.target, p = sys.partner;
    switch (action) {
      case 'collect': {
        if (!play(CLIP_OF[t.kind], t.kind === 'rock' ? rockStand(t) : standPoint(view.eye, t.point, GROUND_STAND_M))) return null;
        phase = 'collecting'; sample = { id: ++seq, kind: t.kind, site: t.site, x: round2(t.point.x), z: round2(t.point.z) };
        emit('collect', sample); return action;
      }
      case 'photo':
        emit('photo', { kind: t.kind, site: t.site, x: round2(t.point.x), z: round2(t.point.z) }); return action;
      case 'stow':
        if (!play('stow_sample', null)) return null;
        phase = 'stowing'; break;
      case 'pour':
        if (!play('pour_sample', pourStand(sys.props.tcase.position, p.root.position, CASE_STAND_M, view.eye))) return null;
        phase = 'pouring'; break;
      case 'call-case':
        if (!p.command('toggleCase')) return null;
        caseRequested = true; break;
      case 'pick-up-case':
        if (!p.command('toggleCase')) return null;
        break;
      default:
        return null;
    }
    emit('input', { action });   // no checklist change; lets the store refresh the prompt at once
    return action;
  }

  function finish() { stand = pin = null; phase = 'idle'; sample = null; sys.arms.set('down'); }   // the scoop goes back on the belt

  /** Per frame, after props.update: follows the clip, holds the player at the stand point, finishes the hand-over. */
  function update(dt) {
    const arms = sys.arms, props = sys.props, partner = sys.partner;
    if (stand && arms.clip) {   // hold the player still during the clip (undo walking), stepping to the stand point first
      const e = view.eye, gx = stand.x - pin.x, gz = stand.z - pin.z, gd = Math.hypot(gx, gz), st = Math.min(gd, STEP_IN_SPEED * dt);
      e.x = gd > 1e-6 ? pin.x + gx / gd * st : stand.x; e.z = gd > 1e-6 ? pin.z + gz / gd * st : stand.z; pin.x = e.x; pin.z = e.z;
      if (stand.yaw !== null) view.yaw += angleDelta(view.yaw, stand.yaw) * Math.min(1, dt * 8);
    }
    if (phase === 'collecting') {
      if (!shown && props.content) { shown = true; emit('texture', sample); }   // the soil or the chips are in the scoop, in view
      if (!arms.clip) { stand = pin = null; if (props.content) phase = 'holding'; else { phase = 'idle'; sample = null; } }
    } else if (phase === 'stowing') {
      if (!secured && !props.content) { secured = true; emit('secured', { ...sample, into: 'pouch' }); }   // into the bag at 1.1 s
      if (!arms.clip) { const done = sample; finish(); if (secured) emit('sealed', { ...done, into: 'pouch' }); }   // the clip ends with the bag closed
    } else if (phase === 'pouring') {
      if (!secured && !props.content) { secured = true; if (props.pending) landing = sample; }        // the sample left the scoop toward the open case
      if (!arms.clip) finish();
    }
    if (landing && !props.pending) { emit('secured', { ...landing, into: 'case' }); sealing = landing; landing = null; }   // it landed in the case (0.55 s)
    // hand-over step 3: once the pour is over, the partner closes the lid and takes the case back (any pick-up closes the lid)
    if (sealing && phase === 'idle' && !landing) {
      if (!partnerHere()) sealing = null;
      else if (partner.carrying) { emit('sealed', { ...sealing, into: 'case' }); sealing = null; }
      else if (!partner.bending) partner.command('toggleCase');   // retried next frame if the partner is busy
    }
  }

  /** Plain snapshot for the store bridge (polled a few times per second, never per frame). */
  function status() {
    const s = situation(), t = s.target;
    return {
      phase: s.phase,
      holding: phase === 'holding' && sample ? sample.kind : null,
      target: t ? { kind: t.kind, site: t.site, distanceM: Math.round(t.distanceM * 10) / 10, inReach: t.inReach } : null,
      caseState: s.caseState, caseInReach: s.caseInReach,
      actions: inputActions(s),
    };
  }

  // input: a click (not the end of a drag-to-look) samples what the crosshair is on; keys P, E and F
  let dragged = 0;
  canvas.addEventListener('pointerdown', () => { dragged = 0; }, { signal });
  canvas.addEventListener('pointermove', (e) => { if (e.buttons && document.pointerLockElement !== canvas) dragged += Math.abs(e.movementX) + Math.abs(e.movementY); }, { signal });
  canvas.addEventListener('click', () => { if (walk() && dragged <= 4) act('click'); }, { signal });
  addEventListener('keydown', (e) => {
    const input = KEYS[e.code], el = e.target;
    if (!input || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !walk()) return;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    act(input);
  }, { signal });

  return {
    act, update, status,
    /** The sampling phase ('idle' | 'collecting' | 'holding' | 'stowing' | 'pouring'); read by the wrist gate (#67). */
    phase: () => phase,
    /** @param {(event: { type: string }) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
