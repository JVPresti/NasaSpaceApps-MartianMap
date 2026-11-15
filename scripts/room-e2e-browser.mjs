// Two browser tabs in one online room (#54), driven by puppeteer-core. Needs npm run dev:room and npm run dev, and a
// Chrome or Chromium binary in CHROME. Marks finds in tab A the way src/state/finds.js does (a store write) and times
// their arrival in tab B, claims samples from both tabs, moves the case, and reloads tab B.
//
//   CHROME=/path/to/chrome node scripts/room-e2e-browser.mjs
//   QA_GPU=1 CHROME=/path/to/chromium node scripts/room-e2e-browser.mjs   (GPU through WSLg, see scripts/qaBrowser.mjs)
//
// ROOM (default TEST), TAB_RACES (20), RACE_GAP ms between races (keep it above 200: the client sends at most 5
// actions per second and queues the rest), SLOW_RAF ms per frame for machines with software WebGL. Results:
// docs/qa/online-m3.md.
import { checkRenderer, launchBrowser } from './qaBrowser.mjs';
const ROOM = process.env.ROOM || 'TEST';
const URL = `http://localhost:5173/?room=${ROOM}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls fn in the page every 20 ms (Node side) until it returns a truthy value. */
async function until(page, fn, arg, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error('until: timeout ' + fn.toString().slice(0, 80));
    await sleep(20);
  }
}
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const open = async () => {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  // Software WebGL in this VM takes the main thread for seconds per frame; at 1 frame per second the page keeps up.
  if (process.env.SLOW_RAF) await p.evaluateOnNewDocument((ms) => { window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), ms); }, Number(process.env.SLOW_RAF));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  // ?room= opens the join panel; the socket opens on "Join the room" (#52)
  await p.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: 300000 });
  await p.click('.online-join button.start-primary');
  await until(p, () => window.__missionStore?.getState().online.status === 'open' && !!window.__online, null, 120000);
  return p;
};
const a = await open(), b = await open();
console.log('renderer', await checkRenderer(a));
const ids = await Promise.all([a, b].map((p) => p.evaluate(() => window.__missionStore.getState().online.me.id)));
console.log('A', ids[0], 'B', ids[1]);
const before = await b.evaluate(() => window.__missionStore.getState().shared.markers.length);
await b.evaluate(() => { window.__seen = {}; window.__missionStore.subscribe((s) => { for (const m of s.shared.markers) if (!window.__seen[m.cid]) window.__seen[m.cid] = Date.now(); }); });

// 1. marker latency, 10 finds marked in A (the same store write markFind makes)
const lat = [];
for (let i = 0; i < 10; i++) {
  const { t0, cid } = await a.evaluate(() => {
    const st = window.__missionStore, n = st.getState().finds.list.length, id = 'e2e-' + Date.now();
    const t0 = Date.now();
    st.setState((s) => ({ finds: { ...s.finds, list: [...s.finds.list, { id, label: 'M' + String(n % 8 + 1).padStart(2, '0'), x: -30 + n * 3, z: -40 + n * 2, status: 'priced', detour: null, error: null, basis: null }] } }));
    return { t0, cid: st.getState().shared.findCids[id] };
  });
  await until(b, (c) => window.__seen[c], cid);
  lat.push((await b.evaluate((c) => window.__seen[c], cid)) - t0);
  await sleep(250);
}
lat.sort((x, y) => x - y);
console.log('marker latency ms', lat.join(','), 'median', lat[5], 'max', lat[9]);

// 2. samples: A takes one, B's claim of the same is refused with A's id and the notice
const sid = 'site-e2e-' + Date.now();
const ra = await a.evaluate((sid) => window.__online.shared.claimSample({ sid }), sid);
const rb = await b.evaluate((sid) => window.__online.shared.claimSample({ sid }), sid);
const notice = await b.evaluate(() => window.__missionStore.getState().shared.notice);
console.log('claim A', JSON.stringify(ra), 'claim B', JSON.stringify(rb), 'notice', JSON.stringify(notice));
// a sample race from two tabs, 20 times
let clean = 0;
for (let i = 0; i < Number(process.env.TAB_RACES || 20); i++) {
  const s = 'tabrace_' + Date.now() + '_' + i;
  const [x, y] = await Promise.all([a.evaluate((s) => window.__online.shared.claimSample({ sid: s }), s), b.evaluate((s) => window.__online.shared.claimSample({ sid: s }), s)]);
  if ([x, y].filter((r) => r.ok).length === 1 && x.by === y.by) clean++;
  else console.log('race', i, JSON.stringify(x), JSON.stringify(y));
  await sleep(Number(process.env.RACE_GAP || 0));
}
console.log('tab race clean', clean, '/', Number(process.env.TAB_RACES || 20), 'gap', process.env.RACE_GAP || 0, 'ms');

// 3. case: A's partner sets the case down (caseState leaves 'carried'); B sees A as holder
await a.evaluate(() => { const st = window.__missionStore; const set = (cs) => st.setState((s) => ({ sampling: { ...s.sampling, status: { ...(s.sampling.status || { phase: 'idle', actions: {} }), caseState: cs } } })); set('carried'); set('coming'); });
await until(b, (id) => window.__missionStore.getState().shared.caseHolder === id, ids[0]);
console.log('B sees case holder A: yes');

// 4. reload B: markers, samples and the case holder come back from the welcome
const snap = (p) => p.evaluate(() => { const s = window.__missionStore.getState().shared; return { markers: s.markers.length, samples: Object.keys(s.samples).length, caseHolder: s.caseHolder }; });
const pre = await snap(b);
await b.reload({ waitUntil: 'domcontentloaded' });
await until(b, () => window.__missionStore?.getState().online.status === 'open', null, 120000);
const post = await snap(b);
const sameId = await b.evaluate(() => window.__missionStore.getState().online.me.id);
console.log('reload B before', JSON.stringify(pre), 'after', JSON.stringify(post), 'same id', sameId === ids[1], 'markers before test', before);

await browser.close();
