// End-to-end checks for online rooms (#52) against a running Worker. No dependencies: Node 24's global
// WebSocket (undici) can set the Origin header, and node:http checks the refused upgrades.
//
//   npm run build            (once; wrangler dev serves dist/)
//   npm run dev:room         (port 8787)
//   node scripts/room-smoke.mjs [base] [origin]
//
// base defaults to http://localhost:8787. Use http://localhost:5173 to go through the Vite proxy (npm run dev).
// origin defaults to http://localhost:5173, the Origin a browser on the Vite dev server sends.
// Results: docs/qa/online-m1.md, and docs/qa/online-m3.md for the shared state checks (ONLY=shared, ONLY=separate).
// ONLY=separate ROOM=ABCD TAG=x places one marker labelled with TAG in room ABCD and prints the room's marker labels,
// so the same code on two hosts can be compared.
import http from 'node:http';

const BASE = new URL(process.argv[2] || 'http://localhost:8787');
const ORIGIN = process.argv[3] || 'http://localhost:5173';
const WS_BASE = (BASE.protocol === 'https:' ? 'wss://' : 'ws://') + BASE.host;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
}

/** One player. Collects every message; `wait(type, pred)` resolves on the first match from now on. */
function client(room, { id = 'p' + Math.random().toString(36).slice(2, 10), role = 'surface', color, hello = true } = {}) {
  const ws = new WebSocket(WS_BASE + '/api/room/' + room, { headers: { Origin: ORIGIN } });
  const c = { id, ws, msgs: [], waiters: [], closed: null, welcome: null };
  c.opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  c.closedP = new Promise((resolve) => ws.addEventListener('close', (e) => { c.closed = { code: e.code, reason: e.reason, at: performance.now() }; resolve(c.closed); }));
  ws.addEventListener('message', (e) => {
    if (e.data === 'pong') { c.pongs = (c.pongs || 0) + 1; return; }
    const m = JSON.parse(e.data);
    m.at = performance.now();
    c.msgs.push(m);
    if (m.type === 'welcome') c.welcome = m;
    c.waiters = c.waiters.filter((w) => (w.match(m) ? (w.resolve(m), false) : true));
  });
  c.wait = (type, pred = () => true, ms = 5000) => new Promise((resolve, reject) => {
    const w = { match: (m) => m.type === type && pred(m), resolve };
    c.waiters.push(w);
    setTimeout(() => reject(new Error('timeout waiting for ' + type)), ms);
  });
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.join = async () => {
    await c.opened;
    const msg = { type: 'hello', v: 1, id, name: 'Smoke ' + id.slice(-4), role };
    if (color !== undefined) msg.color = color;
    const w = Promise.race([c.wait('welcome'), c.closedP]);
    c.helloAt = performance.now();
    c.send(msg);
    return w;
  };
  if (hello) c.ready = c.join();
  return c;
}

/** Raw upgrade request; returns the HTTP status (101 when it would connect). */
function upgradeStatus(path, origin) {
  return new Promise((resolve, reject) => {
    const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' };
    if (origin) headers.Origin = origin;
    const req = http.request({ host: BASE.hostname, port: BASE.port, path, headers });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('error', reject);
    req.end();
  });
}

async function clockOffset(c, samples = 5) {
  let best = null;
  for (let i = 0; i < samples; i++) {
    const c0 = Date.now();
    const p = c.wait('t', (m) => m.c === c0);
    c.send({ type: 't', c: c0 });
    const m = await p;
    const c1 = Date.now();
    const s = { rtt: c1 - c0, offset: m.s - (c0 + c1) / 2 };
    if (!best || s.rtt < best.rtt) best = s;
  }
  return best;
}

async function joinAndLeave() {
  const room = code();
  const a = client(room);
  await a.ready;
  const b = client(room);
  const joinSeen = a.wait('crew', (m) => m.op === 'join' && m.p.id === b.id);
  const bw = await b.ready;
  const tJoin = (await joinSeen).at - b.helloAt;
  check('crew join reaches the other player within 2 s', tJoin < 2000, `${tJoin.toFixed(1)} ms after B sent hello`);
  check('welcome lists both players', bw.crew.map((e) => e.id).join() === [a.id, b.id].join(), bw.crew.map((e) => `${e.name}/${e.color}`).join(', '));
  const leaveSeen = a.wait('crew', (m) => m.op === 'leave' && m.p.id === b.id);
  const t0 = performance.now();
  b.ws.close(1000);
  const tLeave = (await leaveSeen).at - t0;
  check('crew leave reaches the other player within 2 s', tLeave < 2000, `${tLeave.toFixed(1)} ms after close()`);
  a.ws.close();
  return { tJoin, tLeave };
}

async function seats() {
  const room = code();
  const surface = [];
  for (let i = 0; i < 4; i++) { const c = client(room); await c.ready; surface.push(c); }
  check('4 surface players get colours 0 to 3', surface.map((c) => c.welcome?.you.color).join() === '0,1,2,3', surface.map((c) => c.welcome?.you.color).join(','));
  const fifth = client(room);
  const closed = await fifth.closedP;
  check('5th surface player is closed with 4001 room full', closed.code === 4001 && closed.reason === 'room full', `${closed.code} ${closed.reason}`);
  const habitat = [];
  for (let i = 0; i < 2; i++) { const c = client(room, { role: 'habitat' }); await c.ready; habitat.push(c); }
  check('2 habitat players fit next to 4 surface', habitat.every((c) => c.welcome?.you.role === 'habitat' && c.welcome.you.color === null), `crew ${habitat[1].welcome.crew.length}`);
  const third = client(room, { role: 'habitat' });
  const closed3 = await third.closedP;
  check('3rd habitat player is closed with 4001', closed3.code === 4001, `${closed3.code} ${closed3.reason}`);

  // Same player id again: the old socket is replaced.
  const again = client(room, { id: surface[1].id });
  const replaced = await surface[1].closedP;
  await again.ready;
  check('same player id again replaces the old socket with 4002 and keeps its colour', replaced.code === 4002 && again.welcome.you.color === 1, `${replaced.code} ${replaced.reason}, colour ${again.welcome.you.color}`);

  // Clock: every seated client measures its offset.
  const all = [surface[0], again, surface[2], surface[3], ...habitat];
  const offsets = [];
  for (const c of all) offsets.push(await clockOffset(c));
  const spread = Math.max(...offsets.map((o) => o.offset)) - Math.min(...offsets.map((o) => o.offset));
  check('clock offsets of 6 clients agree within 100 ms', spread < 100, offsets.map((o) => `${o.offset.toFixed(1)}ms/rtt ${o.rtt}ms`).join(', ') + `; spread ${spread.toFixed(1)} ms`);

  // start is idempotent and reaches everyone
  const starts = all.map((c) => c.wait('start'));
  all[0].send({ type: 'start' });
  const first = await Promise.all(starts);
  const again2 = all[3].wait('start');
  all[5].send({ type: 'start' });
  const second = await again2;
  check('start reaches all 6 with one start time and seed; a second start repeats it',
    first.every((m) => m.startedAt === first[0].startedAt && m.seed === first[0].seed) && second.startedAt === first[0].startedAt && second.seed === first[0].seed,
    `startedAt ${first[0].startedAt}, seed ${first[0].seed}`);
  for (const c of all) c.ws.close();
  return { offsets, spread };
}

async function refusals() {
  const room = code();
  check('good upgrade answers 101', (await upgradeStatus('/api/room/' + room, ORIGIN)) === 101);
  const bad = await upgradeStatus('/api/room/IOIO', ORIGIN);
  check('bad room code is refused with 400', bad === 400, String(bad));
  const foreign = await upgradeStatus('/api/room/' + room, 'https://evil.example');
  check('foreign Origin is refused with 403', foreign === 403, String(foreign));
  const none = await upgradeStatus('/api/room/' + room, null);
  check('missing Origin is refused with 403', none === 403, String(none));
  const other = await upgradeStatus('/api/rooms', ORIGIN);
  check('other /api path answers 404', other === 404, String(other));

  const first = client(room, { hello: false });
  await first.opened;
  first.send({ type: 't', c: 1 });
  const hf = await first.closedP;
  check('a message before hello closes with 4003', hf.code === 4003, `${hf.code} ${hf.reason}`);

  const big = client(room);
  await big.ready;
  big.send(JSON.stringify({ type: 't', c: 1, pad: 'x'.repeat(5000) }));
  const tb = await big.closedP;
  check('a 5 KB message closes with 1009', tb.code === 1009, `${tb.code} ${tb.reason}`);
}

async function flood() {
  const room = code();
  const a = client(room);
  await a.ready;
  const t0 = performance.now();
  let sent = 0;
  const timer = setInterval(() => { if (a.ws.readyState === 1) { a.send({ type: 't', c: sent++ }); } }, 1000 / 60);
  const closed = await Promise.race([a.closedP, sleep(12_000).then(() => null)]);
  clearInterval(timer);
  const answered = a.msgs.filter((m) => m.type === 't').length;
  const secs = ((closed?.at ?? performance.now()) - t0) / 1000;
  check('a 60 msg/s flood is dropped above the cap', answered < sent * 0.6, `${sent} sent, ${answered} answered in ${secs.toFixed(1)} s (${(answered / secs).toFixed(1)}/s)`);
  check('then closed with 1008 after about 5 s', closed?.code === 1008 && secs >= 5 && secs < 9, closed ? `${closed.code} ${closed.reason} after ${secs.toFixed(1)} s` : 'not closed');
  return { sent, answered, secs };
}

async function hibernation(idleMs) {
  const room = code();
  const a = client(room);
  const b = client(room, { role: 'habitat' });
  await Promise.all([a.ready, b.ready]);
  a.send({ type: 'start' });
  const started = await a.wait('start');
  console.log(`idle ${idleMs / 1000} s with pings only in room ${room} (watch the dev:room log for the Room constructor)`);
  const pinger = setInterval(() => { for (const c of [a, b]) if (c.ws.readyState === 1) c.ws.send('ping'); }, 5000);
  await sleep(idleMs);
  clearInterval(pinger);
  check('pings were answered while idle', (a.pongs || 0) > 0 && (b.pongs || 0) > 0, `pongs ${a.pongs}/${b.pongs}`);
  console.log('waking room ' + room + ' at ' + new Date().toISOString());
  const c = client(room);
  const w = await c.ready;
  check('after the idle period the crew list is intact', w.crew.map((e) => e.id).join() === [a.id, b.id, c.id].join(), w.crew.map((e) => `${e.role}/${e.color}`).join(', '));
  check('and the mission start survived', w.startedAt === started.startedAt && w.seed === started.seed, `startedAt ${w.startedAt}, seed ${w.seed}`);
  for (const x of [a, b, c]) x.ws.close();
}

async function sharedState() {
  const room = code();
  const a = client(room), b = client(room);
  await Promise.all([a.ready, b.ready]);

  // marker: one broadcast to both, with the room's id and author
  const seen = b.wait('mk', (m) => m.cid === 'smoke-1');
  const t0 = performance.now();
  a.send({ type: 'mk', cid: 'smoke-1', kind: 'find', x: 12.5, z: -3.25, label: 'M01' });
  const m = await seen;
  const tMarker = m.at - t0;
  check('a marker reaches the other player within 1 s', tMarker < 1000 && m.author === a.id && m.id > 0, `${tMarker.toFixed(1)} ms, id ${m.id}`);
  const before = b.msgs.filter((x) => x.type === 'mk').length;
  const echo = a.wait('mk', (x) => x.cid === 'smoke-1' && x.at > t0 + 1);
  a.send({ type: 'mk', cid: 'smoke-1', kind: 'find', x: 99, z: 99, label: 'again' });
  const back = await echo;
  await sleep(300);
  check('a resend with the same cid is ignored: the sender gets the stored row, the other player nothing',
    back.x === 12.5 && b.msgs.filter((x) => x.type === 'mk').length === before, `stored x ${back.x}`);

  // the sample race, 20 times: two claims of the same sample sent at the same moment
  const RACES = Number(process.env.RACES || 20);
  let clean = 0;
  const lines = [];
  for (let i = 0; i < RACES; i++) {
    const sid = 'race_' + i;
    const won = [a.wait('smp', (x) => x.sid === sid && x.ok), b.wait('smp', (x) => x.sid === sid && x.ok)];
    a.send({ type: 'smp', sid });
    b.send({ type: 'smp', sid });
    const [wa] = await Promise.all(won);
    const loser = wa.by === a.id ? b : a;
    const lost = await loser.wait('smp', (x) => x.sid === sid && x.ok === false).catch(() => null);
    await sleep(80);
    const oks = [a, b].map((c) => c.msgs.filter((x) => x.type === 'smp' && x.sid === sid && x.ok).length);
    const ok = oks[0] === 1 && oks[1] === 1 && lost && lost.by === wa.by;
    if (ok) clean++;
    lines.push(wa.by === a.id ? 'A' : 'B');
  }
  check(`${RACES} simultaneous claims of the same sample: exactly one winner each time, the loser told who`, clean === RACES, `${clean}/${RACES} clean; winners ${lines.join('')}`);

  // tool case
  const ca = Promise.all([a.wait('case'), b.wait('case')]);
  a.send({ type: 'case', holder: a.id });
  await ca;
  const refused = b.wait('case');
  b.send({ type: 'case', holder: b.id });
  check('the case holder is kept; another player is told who has it', (await refused).holder === a.id);

  // reload: a new socket for b with the same id restores markers, samples and the case holder
  const b2 = client(room, { id: b.id });
  const w = await b2.ready;
  check('a reload restores markers, samples and the case holder',
    w.markers.length === 1 && w.markers[0].cid === 'smoke-1' && w.samples.length === RACES && w.caseHolder === a.id,
    `${w.markers.length} marker, ${w.samples.length} samples, case with ${w.caseHolder === a.id ? 'A' : w.caseHolder}; welcome ${JSON.stringify(w).length} B`);
  for (const c of [a, b, b2]) c.ws.close();
  return { tMarker, clean };
}

async function separation() {
  const room = process.env.ROOM || 'TEST';
  const tag = process.env.TAG || 'smoke';
  const a = client(room);
  await a.ready;
  const cid = 'sep-' + tag.replace(/[^A-Za-z0-9_-]/g, '') + '-' + Date.now().toString(36);
  const mine = a.wait('mk', (m) => m.cid === cid);
  a.send({ type: 'mk', cid, kind: 'note', x: 0, z: 0, label: tag });
  await mine;
  const c = client(room);
  const w = await c.ready;
  const labels = w.markers.map((m) => m.label);
  console.log(`room ${room} on ${BASE.host}: ${labels.length} markers: ${labels.join(', ')}`);
  check(`room ${room} on ${BASE.host} has the marker just placed`, labels.includes(tag));
  if (process.env.ABSENT) check(`and none labelled ${process.env.ABSENT}`, !labels.includes(process.env.ABSENT), labels.join(', '));
  a.ws.close(); c.ws.close();
}

const only = process.env.ONLY;
const idle = Number(process.env.IDLE_MS || 15_000);
console.log(`room smoke test against ${WS_BASE} with Origin ${ORIGIN}`);
if (!only || only === 'join') await joinAndLeave();
if (!only || only === 'seats') await seats();
if (!only || only === 'refuse') await refusals();
if (!only || only === 'flood') await flood();
if (!only || only === 'shared') await sharedState();
if (only === 'separate') await separation();
if (!only || only === 'hibernate') await hibernation(idle);
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
