/**
 * Shared state of a room (#54): markers, the sample log and the tool case, written into the store's `shared` slice
 * (docs/STATE_AND_ENGINE.md). The room is the authority. Every `welcome` rebuilds the slice from the room's SQLite, so a
 * reload or a reconnect restores it, and the `mk`, `smp` and `case` broadcasts keep it current.
 *
 * What it sends:
 *   mk    a find the local player marks (store `finds.list`, src/state/finds.js), kind 'find', with a client id (cid).
 *         addMarker() sends the other kinds ('note', 'go'), for the habitat seat (#55).
 *   smp   claimSample(), called by the engine through src/state/sharedHooks.js when the player clicks to scoop.
 *   case  the local case hand-over: when the scripted partner sets the case down for this player (store
 *         `sampling.status.caseState` leaves 'carried'), this player takes it; when the partner carries it again, it goes back.
 *
 * Offline queue: markers and sample claims made while the room is not open stay local and go out on the next welcome,
 * except the ones the welcome already has. The cid (markers) and the sample id make every resend idempotent.
 */
import { MSG, SAMPLE_CLAIM_TIMEOUT_MS } from './protocol.js';

/** The store slice that means "no shared state" (offline). Keep in sync with createInitialState() in src/state/store.js. */
export const SHARED_OFFLINE = Object.freeze({ markers: [], samples: {}, caseHolder: null, notice: null, findCids: {} });

/** How long a notice ("Sample already taken by ...") stays in the store. */
export const NOTICE_MS = 4000;
/** Retry delay for queued messages the client's action cap refused (5 actions per second). */
const RETRY_MS = 250;
/** caseState values (src/engine/samplingRules.js caseState) in which the case is out for this player. */
const CASE_OUT = new Set(['coming', 'setting-down', 'down', 'picking-up']);

let cidCounter = 0;
function defaultCid(playerId) {
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  cidCounter = (cidCounter + 1) % 1296;
  return playerId.slice(0, 12) + '-' + Date.now().toString(36) + cidCounter.toString(36) + rand;
}

/**
 * @param {{ store: object, room: { send(msg): boolean, on(type, fn): () => void, onStatus(fn): () => void, status: string },
 *   playerId: string, timers?: object, now?: () => number, makeCid?: () => string }} options
 */
export function createSharedState({ store, room, playerId, timers = globalThis, now = () => Date.now(), makeCid = () => defaultCid(playerId) }) {
  const rows = new Map();      // cid -> marker row from the room
  const queue = new Map();     // cid -> { kind, x, z, label, at, author, sent } not confirmed by the room yet
  const samples = new Map();   // sid -> { by, at, pending? }
  const claims = new Map();    // sid -> { resolve, timer, queued, sent, settled } claims of this player the room has not answered
  const findCids = {};         // local find id -> cid
  let caseHolder = null;
  let caseWant;                // undefined: no request; this player's id or null: what the local hand-over asked for
  let notice = null, noticeSeq = 0, noticeTimer = null;
  let retryTimer = null;
  let written = null;
  let caseOut = false;
  let stopped = false;

  const me = () => store.getState().online?.me?.id ?? playerId;
  const isOpen = () => room.status === 'open';

  function write() {
    if (stopped) return;
    const markers = [...rows.values()].sort((a, b) => a.id - b.id).map((r) => ({ ...r, pending: false }));
    for (const [cid, q] of queue) markers.push({ id: null, cid, author: q.author, kind: q.kind, x: q.x, z: q.z, label: q.label, at: q.at, pending: true });
    const sampleObj = {};
    for (const [sid, v] of samples) sampleObj[sid] = { ...v };
    written = { markers, samples: sampleObj, caseHolder, notice, findCids: { ...findCids } };
    store.setState({ shared: written });
  }

  function showNotice(key, by) {
    noticeSeq += 1;
    notice = { key, by: by ?? null, seq: noticeSeq, atMs: now() };
    if (noticeTimer !== null) timers.clearTimeout(noticeTimer);
    const seq = noticeSeq;
    noticeTimer = timers.setTimeout(() => { noticeTimer = null; if (notice && notice.seq === seq) { notice = null; write(); } }, NOTICE_MS);
  }

  function scheduleRetry() {
    if (retryTimer !== null || stopped) return;
    retryTimer = timers.setTimeout(() => { retryTimer = null; flush(); write(); }, RETRY_MS);
  }

  /** Sends every queued marker and claim that is not out yet. Only while the room is open. */
  function flush() {
    if (!isOpen() || stopped) return;
    let blocked = false;
    for (const [cid, q] of queue) {
      if (q.sent) continue;
      if (room.send({ type: MSG.MARKER, cid, kind: q.kind, x: q.x, z: q.z, label: q.label })) q.sent = true;
      else blocked = true;
    }
    for (const [sid, c] of claims) {
      if (!c.queued || c.sent) continue;
      if (room.send({ type: MSG.SAMPLE, sid })) c.sent = true;
      else blocked = true;
    }
    if (caseWant !== undefined && caseWant !== caseHolder && !room.send({ type: MSG.CASE, holder: caseWant })) blocked = true;
    if (blocked) scheduleRetry();
  }

  function settle(sid, result) {
    const c = claims.get(sid);
    if (!c) return;
    if (c.timer !== null) timers.clearTimeout(c.timer);
    claims.delete(sid);
    if (!c.settled && c.resolve) c.resolve(result);
    if (!result.ok) showNotice('sample-taken', result.by);
  }

  /** The engine's sample gate (src/state/sharedHooks.js): { ok, by } now, or a promise of it that settles within 1.5 s. */
  function claimSample(claim) {
    const sid = claim?.sid;
    if (!sid || stopped) return null;
    const self = me();
    const known = samples.get(sid);
    if (known) {
      if (known.by === self) return { ok: true, by: self };
      showNotice('sample-taken', known.by);
      write();
      return { ok: false, by: known.by };
    }
    if (claims.has(sid)) return { ok: true, by: self };   // already claimed and waiting; the scoop goes ahead
    const queueLocally = () => {
      claims.set(sid, { resolve: null, timer: null, queued: true, sent: false, settled: true });
      samples.set(sid, { by: self, at: now(), pending: true });
      write();
      return { ok: true, by: self };
    };
    if (!isOpen()) return queueLocally();
    // A claim the client's action cap holds back waits for the retry inside the same 1.5 s window. Going ahead
    // locally at once would let two players who both hit the cap win the same sample.
    const out = room.send({ type: MSG.SAMPLE, sid });
    return new Promise((resolve) => {
      const c = { resolve, timer: null, queued: !out, sent: out, settled: false };
      // No answer in time: the scoop goes ahead locally and the claim stays queued for the next welcome.
      c.timer = timers.setTimeout(() => {
        c.timer = null;
        if (claims.get(sid) !== c) return;
        c.settled = true; c.queued = true; c.sent = false;
        samples.set(sid, { by: self, at: now(), pending: true });
        write();
        resolve({ ok: true, by: self, timedOut: true });
      }, SAMPLE_CLAIM_TIMEOUT_MS);
      claims.set(sid, c);
      if (!out) scheduleRetry();
    });
  }

  /** False while another player holds the tool case. */
  const mayCallCase = () => caseHolder === null || caseHolder === me();

  /** Places a marker. Returns its cid. Offline it stays in the queue until the next welcome. */
  function addMarker({ kind, x, z, label = '' }) {
    const cid = makeCid();
    queue.set(cid, { kind, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, label: String(label).slice(0, 64), at: null, author: me(), sent: false });
    flush();
    write();
    return cid;
  }

  function onWelcome(m) {
    rows.clear();
    for (const r of m.markers) if (r && typeof r.cid === 'string') rows.set(r.cid, { id: r.id, cid: r.cid, author: r.author, kind: r.kind, x: r.x, z: r.z, label: r.label ?? '', at: r.at });
    for (const cid of rows.keys()) queue.delete(cid);
    for (const q of queue.values()) q.sent = false;   // not in the room: send again
    const self = m.you?.id ?? me();
    const local = [...samples].filter(([, v]) => v.pending);
    samples.clear();
    for (const s of m.samples) if (s && typeof s.sid === 'string') samples.set(s.sid, { by: s.by, at: s.at });
    for (const [sid, c] of [...claims]) {
      const held = samples.get(sid);
      if (held) settle(sid, held.by === self ? { ok: true, by: self } : { ok: false, by: held.by });
      else { c.sent = false; c.queued = true; }
    }
    for (const [sid, v] of local) if (!samples.has(sid)) samples.set(sid, v);   // still waiting for the room
    caseHolder = m.caseHolder ?? null;
    if (caseWant === caseHolder) caseWant = undefined;
    flush();
    write();
  }

  function onMarker(m) {
    if (m.id === undefined) return;
    rows.set(m.cid, { id: m.id, cid: m.cid, author: m.author, kind: m.kind, x: m.x, z: m.z, label: m.label ?? '', at: m.at });
    queue.delete(m.cid);
    write();
  }

  function onSample(m) {
    if (m.by === undefined) return;
    const self = me();
    samples.set(m.sid, { by: m.by, at: m.at });
    if (claims.has(m.sid)) settle(m.sid, m.by === self ? { ok: true, by: self } : { ok: false, by: m.by });
    write();
  }

  function onCase(m) {
    const self = me();
    caseHolder = m.holder;
    if (caseWant !== undefined) {
      if (caseWant === self && m.holder !== self && m.holder !== null) showNotice('case-held', m.holder);
      caseWant = undefined;
    }
    write();
  }

  function wantCase(holder) {
    caseWant = holder;
    if (caseWant === caseHolder) { caseWant = undefined; return; }
    flush();
  }

  /** Store changes: new local finds become markers, the local hand-over moves the case, a store reset is undone. */
  function onStore(s, prev) {
    if (stopped) return;
    if (s.finds?.list !== prev?.finds?.list) {
      let added = false;
      for (const f of s.finds?.list || []) {
        if (findCids[f.id] || !Number.isFinite(f.x) || !Number.isFinite(f.z)) continue;
        findCids[f.id] = addMarker({ kind: 'find', x: f.x, z: f.z, label: f.label });
        added = true;
      }
      if (added) write();
    }
    const cs = s.sampling?.status?.caseState;
    const out = CASE_OUT.has(cs);
    if (out !== caseOut) {
      caseOut = out;
      if (out && caseHolder === null) wantCase(me());
      else if (!out && (caseHolder === me() || caseWant === me())) wantCase(null);
    }
    if (store.getState().shared !== written) write();   // resetStore() put the offline defaults back; the room's state still holds
  }

  const offs = [
    room.on(MSG.WELCOME, onWelcome),
    room.on(MSG.MARKER, onMarker),
    room.on(MSG.SAMPLE, onSample),
    room.on(MSG.CASE, onCase),
    store.subscribe(onStore),
  ];
  onStore(store.getState(), null);
  write();

  return {
    claimSample,
    mayCallCase,
    addMarker,
    /** Internal view for tests: queued marker cids and open claims. */
    pending: () => ({ markers: [...queue.keys()], claims: [...claims.keys()] }),
    stop() {
      if (stopped) return;
      for (const off of offs) off();
      for (const [sid, c] of claims) { if (c.timer !== null) timers.clearTimeout(c.timer); if (!c.settled && c.resolve) c.resolve({ ok: true, by: me() }); claims.delete(sid); }
      if (retryTimer !== null) timers.clearTimeout(retryTimer);
      if (noticeTimer !== null) timers.clearTimeout(noticeTimer);
      stopped = true;
      store.setState({ shared: { ...SHARED_OFFLINE } });
    },
  };
}
