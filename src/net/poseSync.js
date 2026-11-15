/**
 * Pose and telemetry sync for online play (#53, docs/IMPLEMENTATION_PLAN.md 9.4).
 *
 * Send side. createPoseSender sends a `p` only when the suit moved more than 5 cm, turned more than 1 degree
 * or changed gait, action, case or lamp, at most `hz` times per second (5 by default, never above
 * CLIENT_RATE.poseMaxHz = 10, however often tick() runs). A player who stands still sends nothing; the
 * 10 s `ping` of src/net/room.js keeps the socket alive. createTelemetrySender sends `tel` every 5 s.
 *
 * Receive side. createPoseBuffer keeps the last poses of one remote player. Each `ct` is mapped to local
 * time with the smallest `recv - ct` seen from that sender (the fastest delivery is the best guess of the
 * clock difference). sample(now) renders at now - 150 ms, interpolating between the two samples around that
 * time (heading the short way round) and holding the last pose when the buffer runs dry.
 *
 * startPoseSync wires both to a room connection, the mission store and the engine. Plain JavaScript.
 */
import { CLIENT_RATE, MSG, ROLE } from './protocol.js';
import { createNetPartner } from './netPartner.js';

export const INTERP_DELAY_MS = 150;
/** Poses kept per remote player: 2 s at 10 per second, plenty for a 150 ms delay. */
export const BUFFER_SAMPLES = 20;
/** How often startPoseSync reads the local pose. The sender's own cap decides how many of these go out. */
export const SAMPLE_MS = 50;
/** Moving faster than this (m/s) sends the walk gait. */
export const WALK_MIN_MS = 0.1;
/** No position change for this long (ms) reads as standing, whatever moveSpeed says. */
export const STILL_MS = 400;

const TAU = Math.PI * 2;
const round = (v, digits) => { const k = 10 ** digits; return Math.round(v * k) / k; };
const wrap = (a) => ((a % TAU) + TAU) % TAU;
/** Signed shortest turn from a to b, in (-PI, PI]. */
export const turnBetween = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * The `p` message for a local pose. x and z are the TRUE position, in cm steps; h and pt in radians to 3
 * decimals; ex and ez the navigation estimate the map shows. Height is never sent.
 * @param {{ x: number, z: number, headingRad: number, pitchRad?: number, gait: 'walk' | 'idle', hand?: number,
 *   ex?: number | null, ez?: number | null, action?: { name: string, timeSec: number } | null,
 *   carrying?: boolean, lampOn?: boolean }} pose
 */
export function poseMessage(pose, ct) {
  const msg = {
    type: MSG.POSE, x: round(pose.x, 2), z: round(pose.z, 2), h: round(wrap(pose.headingRad), 3),
    pt: round(pose.pitchRad || 0, 3), a: pose.gait, hp: pose.hand ?? 0, ct: Math.round(ct),
  };
  if (Number.isFinite(pose.ex) && Number.isFinite(pose.ez)) { msg.ex = round(pose.ex, 1); msg.ez = round(pose.ez, 1); }
  if (pose.action) { msg.ac = pose.action.name; msg.at = round(pose.action.timeSec, 2); }
  if (pose.carrying === false) msg.c = 0;
  if (typeof pose.lampOn === 'boolean') msg.l = pose.lampOn ? 1 : 0;
  return msg;
}

/** True when `next` differs enough from the last pose sent to be worth a message. */
export function poseChanged(last, next) {
  if (!last) return true;
  if (Math.hypot(next.x - last.x, next.z - last.z) > CLIENT_RATE.poseMinMoveM) return true;
  if (Math.abs(turnBetween(last.headingRad, next.headingRad)) > CLIENT_RATE.poseMinTurnDeg * Math.PI / 180) return true;
  return next.gait !== last.gait || (next.hand ?? 0) !== (last.hand ?? 0) || (next.action?.name ?? null) !== (last.action?.name ?? null)
    || (next.carrying !== false) !== (last.carrying !== false) || next.lampOn !== last.lampOn;
}

/**
 * @param {{ send: (msg: object) => boolean, read: () => object | null, now?: () => number, hz?: number }} options
 *   read returns the local pose (see poseMessage) or null when there is nothing to send.
 */
export function createPoseSender({ send, read, now = () => Date.now(), hz = CLIENT_RATE.poseStartHz }) {
  const minGapMs = 1000 / Math.min(Math.max(hz, 0.1), CLIENT_RATE.poseMaxHz);
  let last = null, lastAt = -Infinity, force = false, sent = 0;
  return {
    /** Reads the pose and sends it if it changed and the rate allows. Safe to call every frame. */
    tick() {
      const t = now();
      if (t - lastAt < minGapMs) return false;
      const pose = read();
      if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) || !Number.isFinite(pose.headingRad)) return false;
      if (!force && !poseChanged(last, pose)) return false;
      if (!send(poseMessage(pose, t))) return false;
      last = { ...pose }; lastAt = t; force = false; sent++;
      return true;
    },
    /** Sends the current pose on the next allowed tick even if it did not change: a newcomer has to see us. */
    forceNext() { force = true; },
    get sent() { return sent; },
  };
}

/** `tel` every `everyMs` while read() returns { oxygenPct, batteryPct }. */
export function createTelemetrySender({ send, read, now = () => Date.now(), everyMs = CLIENT_RATE.telemetryMs }) {
  let lastAt = -Infinity;
  return {
    tick() {
      const t = now();
      if (t - lastAt < everyMs) return false;
      const r = read();
      if (!r || !Number.isFinite(r.oxygenPct) || !Number.isFinite(r.batteryPct)) return false;
      if (!send({ type: MSG.TELEMETRY, o2: round(r.oxygenPct, 1), bat: round(r.batteryPct, 1) })) return false;
      lastAt = t;
      return true;
    },
  };
}

/** The interpolation buffer of one remote player. */
export function createPoseBuffer({ delayMs = INTERP_DELAY_MS, maxSamples = BUFFER_SAMPLES } = {}) {
  const samples = [];   // { t (local ms), msg }, oldest first
  let offset = Infinity;
  return {
    /** @param {object} msg a validated `p` @param {number} recvMs local time it arrived */
    push(msg, recvMs) {
      offset = Math.min(offset, recvMs - msg.ct);
      const prev = samples[samples.length - 1];
      if (prev && msg.ct <= prev.msg.ct) return false;   // late or repeated
      let t = msg.ct + offset;
      if (prev && t <= prev.t) t = prev.t + 1;          // the offset shrank: keep the order
      samples.push({ t, msg });
      if (samples.length > maxSamples) samples.shift();
      return true;
    },
    get size() { return samples.length; },
    /** The latest pose received, or null. */
    latest() { return samples.length ? samples[samples.length - 1].msg : null; },
    /**
     * The pose to draw at local time nowMs, or null before the first sample. Continuous fields are
     * interpolated; gait, action, case and lamp come from the earlier of the two samples. speedMs is the
     * speed between them. actionAgeMs says how long ago (render time) the action sample was taken.
     */
    sample(nowMs) {
      if (!samples.length) return null;
      const rt = nowMs - delayMs;
      let i = samples.length - 1;
      while (i > 0 && samples[i - 1].t > rt) i--;
      // i: first sample later than rt, or the last one when rt is past every sample
      const b = samples[i], a = i > 0 ? samples[i - 1] : null;
      if (!a || rt >= b.t) {
        // before the first sample, or the buffer ran dry: hold that pose
        return { ...b.msg, speedMs: 0, held: true, actionAgeMs: Math.max(0, rt - b.t) };
      }
      const k = Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t)));
      const m = a.msg, n = b.msg, dt = (b.t - a.t) / 1000;
      return {
        ...m,
        x: m.x + (n.x - m.x) * k,
        z: m.z + (n.z - m.z) * k,
        h: wrap(m.h + turnBetween(m.h, n.h) * k),
        pt: m.pt + (n.pt - m.pt) * k,
        ex: n.ex ?? m.ex, ez: n.ez ?? m.ez,
        speedMs: dt > 0 ? Math.hypot(n.x - m.x, n.z - m.z) / dt : 0,
        held: false,
        actionAgeMs: Math.max(0, rt - a.t),
      };
    },
  };
}

/** Other surface players in the room, in join order. */
export function remoteSurfacePlayers(online) {
  const me = online?.me?.id;
  return (online?.crew || []).filter((e) => e.role === ROLE.SURFACE && e.id !== me);
}

/**
 * Remote players replace the scripted partner while at least one other surface player is in the room and
 * the connection has not given up. A short reconnect ('connecting') keeps them; 'offline' (three failed
 * reconnects, section 9.7), 'closed' and 'off' bring the scripted partner back.
 */
export function usesRemotePartners(online) {
  const status = online?.status;
  if (status !== 'open' && status !== 'connecting') return false;
  return remoteSurfacePlayers(online).length > 0;
}

/**
 * Wires pose and telemetry sync to a room.
 * @param {{ room: { send: Function, on: Function }, store: { getState: Function, subscribe: Function },
 *   getEngine: () => object | null, timers?: { setInterval: Function, clearInterval: Function },
 *   now?: () => number, hz?: number }} options
 * @returns {{ stop: () => void, sender: object, partners: Map<string, object>, tick: () => void, stats: object }}
 */
export function startPoseSync({ room, store, getEngine, timers = globalThis, now = () => Date.now(), hz }) {
  const buffers = new Map();     // id -> pose buffer
  const partners = new Map();    // id -> net partner source
  const telemetry = new Map();   // id -> { oxygenPct, batteryPct }
  const stats = { posesIn: 0, posesOut: 0, telIn: 0, telOut: 0 };
  let applied = null;            // the list last given to the engine, by ids

  const online = () => store.getState().online;
  const surface = () => online()?.me?.role === ROLE.SURFACE && online()?.status === 'open';

  // moveSpeed is written by the engine's frame loop. A hidden tab stops that loop mid-walk, and a pause turns input
  // off, so the walk gait also needs the position to have changed in the last STILL_MS: otherwise the others would
  // see us walking on the spot until we come back.
  let moved = { x: NaN, z: NaN, at: -Infinity };
  function readPose() {
    const engine = getEngine();
    if (!engine || typeof engine.getPlayer !== 'function') return null;
    const p = engine.getPlayer(), nav = store.getState().navigation || {}, t = now();
    if (p.x !== moved.x || p.z !== moved.z) moved = { x: p.x, z: p.z, at: t };
    const walking = (p.moveSpeed ?? 0) > WALK_MIN_MS && t - moved.at <= STILL_MS;
    return {
      x: p.x, z: p.z, headingRad: (p.headingDeg ?? 0) * Math.PI / 180, pitchRad: p.pitch ?? 0,
      gait: walking ? 'walk' : 'idle', hand: 0, ex: nav.x, ez: nav.z,
    };
  }
  const sender = createPoseSender({ send: (m) => { const ok = room.send(m); if (ok) stats.posesOut++; return ok; }, read: () => (surface() ? readPose() : null), now, hz });
  const tel = createTelemetrySender({
    send: (m) => { const ok = room.send(m); if (ok) stats.telOut++; return ok; },
    read: () => (surface() ? store.getState().suit : null),
    now,
  });

  function bufferFor(id) {
    if (!buffers.has(id)) buffers.set(id, createPoseBuffer());
    return buffers.get(id);
  }
  function forget(id) { buffers.delete(id); partners.delete(id); telemetry.delete(id); }

  /** Keeps one net partner per remote surface player and tells the engine which sources to draw. */
  function sync() {
    const state = online(), players = remoteSurfacePlayers(state), ids = new Set(players.map((e) => e.id));
    for (const id of [...partners.keys()]) if (!ids.has(id)) forget(id);
    for (const e of players) {
      const prev = partners.get(e.id);
      if (!prev || prev.name !== e.name || prev.slot !== e.color) {
        partners.set(e.id, createNetPartner({ entry: e, buffer: bufferFor(e.id), telemetry: () => telemetry.get(e.id) ?? null, now }));
      }
    }
    const list = usesRemotePartners(state) ? players.map((e) => partners.get(e.id)) : [];
    const key = list.map((p) => p.id + ':' + p.slot + ':' + p.name).join(',');
    const engine = getEngine();
    if (!engine || typeof engine.setPartnerSources !== 'function') { applied = null; return; }
    if (key === applied) return;
    try { engine.setPartnerSources(list); applied = key; } catch { applied = null; }
  }

  const offs = [
    room.on(MSG.POSE, (m) => {
      if (!m.id || m.id === online()?.me?.id) return;
      stats.posesIn++;
      bufferFor(m.id).push(m, now());
    }),
    room.on(MSG.TELEMETRY, (m) => {
      if (!m.id) return;
      stats.telIn++;
      telemetry.set(m.id, { oxygenPct: m.o2, batteryPct: m.bat });
    }),
    room.on(MSG.WELCOME, () => sender.forceNext()),
    room.on(MSG.CREW, (m) => {
      if (m.op === 'leave') forget(m.p.id);
      else if (m.p.id !== online()?.me?.id) sender.forceNext();
    }),
    store.subscribe((s, prev) => { if (s.online !== prev.online) sync(); }),
  ];

  function tick() {
    if (applied === null) sync();   // the engine was not ready yet
    sender.tick();
    tel.tick();
  }
  const timer = timers.setInterval(tick, SAMPLE_MS);
  sync();

  return {
    sender, partners, buffers, stats, tick, sync,
    stop() {
      timers.clearInterval(timer);
      for (const off of offs) off();
      const engine = getEngine();
      if (engine && typeof engine.setPartnerSources === 'function' && applied) { try { engine.setPartnerSources([]); } catch { /* disposed */ } }
      applied = null;
      buffers.clear(); partners.clear(); telemetry.clear();
    },
  };
}
