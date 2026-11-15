// Habitat seat end-to-end check (#55): one habitat browser and one surface browser in the same room, driven by
// puppeteer-core. Needs a development build served on one origin, because the scripts drive the app through
// window.__missionStore, window.__online and the engine's window.__marswalk.place:
//
//   NODE_ENV=development npx vite build --mode development && npx wrangler dev --port 8791
//   QA_GPU=1 BASE=http://localhost:8791 node scripts/room-e2e-habitat.mjs        GPU through WSLg (scripts/qaBrowser.mjs)
//   CHROME=/path/to/chrome-headless-shell node scripts/room-e2e-habitat.mjs      SwiftShader, slow
//
// Each page opens on the join panel (?room=); the habitat page picks the Habitat seat there, then both join the room
// with the panel's main action (#308). SHOTS=dir saves screenshots. The spots (535, 544) in sight of the habitat mast
// and (535, 474) behind the ridge north of it come from the terrain height map; the surface HUD's own radio indicator
// confirms the second one. Results: docs/qa/online-m4.md.
import { checkRenderer, launchBrowser } from './qaBrowser.mjs';

const BASE = process.env.BASE || 'http://localhost:8791';
const ROOM = process.env.ROOM || Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const SHOTS = process.env.SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); };

async function until(page, fn, arg, ms = 60000, label = '') {
  const end = Date.now() + ms;
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() > end) {
      const dump = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400), start: document.querySelector('.start-primary')?.outerHTML })).catch((e) => 'evaluate failed: ' + e.message);
      console.log('DUMP', label, JSON.stringify(dump));
      if (SHOTS) await page.screenshot({ path: SHOTS + '/fail-' + label.replace(/\W+/g, '_') + '.jpg', type: 'jpeg', quality: 50 }).catch(() => {});
      throw new Error('until timeout ' + (label || fn.toString().slice(0, 90)));
    }
    await sleep(100);
  }
}

const launch = () => launchBrowser({ viewport: { width: 1280, height: 800 } });

async function openPage(browser, { role } = {}) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => log('pageerror', e.message));
  // Count every message this page sends, by type, before the app opens its socket.
  await p.evaluateOnNewDocument((slow) => {
    window.__sentTypes = {};
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try { const t = data === 'ping' ? 'ping' : JSON.parse(data).type; window.__sentTypes[t] = (window.__sentTypes[t] || 0) + 1; } catch { /* binary */ }
      return send.call(this, data);
    };
    if (slow) window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), slow);
  }, Number(process.env.SLOW_RAF || 0));
  await p.goto(`${BASE}/?room=${ROOM}&tier=low`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  log('WebGL renderer', await checkRenderer(p));
  // ?room= opens the join panel (#308); the socket opens only on the panel's main action, with the seat picked there.
  await p.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: 300000 });
  if (role === 'habitat') await p.evaluate(() => document.querySelector('.online-role input[value="habitat"]')?.click());
  await p.click('.online-join button.start-primary');
  await until(p, () => window.__missionStore?.getState().online.status === 'open' && !!window.__online, null, 300000, 'online open');
  return p;
}

/** Joins again after a reload: the fresh page shows the join panel, the saved role preference picks the same seat. */
async function rejoin(p) {
  await p.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: 300000 });
  await p.click('.online-join button.start-primary');
}

/** Start screen, then the mission table. */
async function toTable(p) {
  await until(p, () => !!document.querySelector('.start-primary:not([disabled])'), null, 300000, 'start button');
  await p.evaluate(() => document.querySelector('.start-primary')?.click());
  await until(p, () => !document.querySelector('.start-primary') && !!document.querySelector('.table-screen'), null, 120000, 'table');
}

async function beginEva(p) {
  await p.evaluate(() => [...document.querySelectorAll('.table-tabs button')].find((b) => b.id === 'table-tab-route')?.click());
  await until(p, () => { const b = [...document.querySelectorAll('.table-primary')].find((x) => /Begin EVA|Continue the EVA/.test(x.textContent)); return b && !b.disabled; }, null, 300000, 'begin enabled');
  await p.evaluate(() => [...document.querySelectorAll('.table-primary')].find((x) => /Begin EVA|Continue the EVA/.test(x.textContent)).click());
  await until(p, () => window.__missionStore.getState().mode === 'walk' && !!document.querySelector('.hud'), null, 120000, 'walk');
}

const place = (p, x, z) => p.evaluate(([x, z]) => window.__marswalk.place(x, z, 0), [x, z]);

const hb = await launch(), sb = await launch();
// Close both browsers however the run ends, so a failed check leaves no Chromium behind.
const closeAll = () => Promise.allSettled([hb.close(), sb.close()]);
process.on('uncaughtException', async (e) => { console.error(e); await closeAll(); process.exit(1); });
process.on('unhandledRejection', async (e) => { console.error(e); await closeAll(); process.exit(1); });
const t0 = Date.now();
const S = await openPage(sb);
log('surface online', S && (await S.evaluate(() => window.__missionStore.getState().online.me)));
const H = await openPage(hb, { role: 'habitat' });
const me = await H.evaluate(() => window.__missionStore.getState().online.me);
log('habitat online', me);
check('habitat client is seated with role habitat and no colour', me.role === 'habitat' && me.color === null);
const habId = me.id;
await S.evaluate((hid) => { window.__pFromHab = 0; window.__pIn = 0; window.__online.on('p', (m) => { window.__pIn++; if (m.id === hid) window.__pFromHab++; }); }, habId);

await toTable(H);
await until(H, () => !!document.querySelector('#table-tab-crew[aria-selected="true"]'), null, 60000, 'crew tab');
check('the habitat table opens on the Crew step', true);
await toTable(S);
await beginEva(S);
log('surface in walk mode after', Math.round((Date.now() - t0) / 1000), 's');

// 1. the habitat sees the surface player move
// The map shows each suit's navigation estimate (ex, ez), which drifts from the true position, so the habitat's marker is
// compared with what the surface player's own suit estimates.
const estimate = () => S.evaluate(() => { const n = window.__missionStore.getState().navigation; return { x: n.x, z: n.z, tx: n.trueX, tz: n.trueZ }; });
async function habitatSees(x, z, label) {
  await place(S, x, z);
  await until(S, ([x, z]) => { const n = window.__missionStore.getState().navigation; return Math.hypot(n.trueX - x, n.trueZ - z) < 1; }, [x, z], 60000, 'surface at ' + label);
  await sleep(1000);   // the drift model writes the estimate 4 times per second
  const est = await estimate();
  const seen = await until(H, (e) => { const c = window.__missionStore.getState().habitat.crew[0]; return c && !c.lastKnown && Math.hypot(c.x - e.x, c.z - e.z) < 1.5 ? c : null; }, est, 60000, 'crew at ' + label)
    .catch(async (err) => {
      log('estimate', JSON.stringify(est), 'now', JSON.stringify(await estimate()), 'sent', JSON.stringify(await S.evaluate(() => window.__sentTypes)));
      log('habitat crew', JSON.stringify(await H.evaluate(() => window.__missionStore.getState().habitat.crew)));
      log('last pose on habitat', JSON.stringify(await H.evaluate(() => { const b = [...window.__online.poses.buffers.values()][0]; return b && b.latest(); })));
      throw err;
    });
  return { est, seen };
}
const { est: e1, seen: first } = await habitatSees(535, 544, '535,544');
const { est: e2, seen: second } = await habitatSees(550, 548, '550,548');
log('surface estimates', JSON.stringify(e1), JSON.stringify(e2));
const dom = await H.evaluate(() => [...document.querySelectorAll('.online-map-suit')].map((li) => ({ cls: li.className, left: li.style.left, top: li.style.top, text: li.textContent })));
check('the habitat map shows the surface player move, live, in their colour', first && second && dom.length === 1 && !dom[0].cls.includes('last-known'),
  `true (535, 544) then (550, 548); surface estimate (${e1.x.toFixed(1)}, ${e1.z.toFixed(1)}) then (${e2.x.toFixed(1)}, ${e2.z.toFixed(1)}); habitat map (${first.x.toFixed(1)}, ${first.z.toFixed(1)}) then (${second.x.toFixed(1)}, ${second.z.toFixed(1)}); DOM ${JSON.stringify(dom[0])}`);
// update rate on the habitat: count store changes of habitat.crew while S walks in small steps
await H.evaluate(() => { window.__crewWrites = 0; window.__missionStore.subscribe((s, p) => { if (s.habitat.crew !== p.habitat.crew) window.__crewWrites++; }); });
for (let i = 0; i < 10; i++) { await place(S, 550 - i, 548 - i * 0.5); await sleep(400); }
const writes = await H.evaluate(() => window.__crewWrites);
check('crew positions update a few times per second on the habitat map', writes >= 5, `${writes} crew updates in about 4 s of stepping`);
const list = await H.evaluate(() => document.querySelector('.habitat-crew')?.innerText);
log('crew list:', JSON.stringify(list));
if (SHOTS) await H.screenshot({ path: SHOTS + '/online-m4-habitat-crew.jpg', type: 'jpeg', quality: 70 });

// 2. behind a ridge
const radioIn = await S.evaluate(() => document.querySelector('.hud-radio')?.className);
await place(S, 535, 474);
const hidden = await until(H, () => { const c = window.__missionStore.getState().habitat.crew[0]; return c && c.lastKnown ? c : null; }, null, 120000, 'last known');
const radioOut = await until(S, () => /lost/.test(document.querySelector('.hud-radio')?.className || '') && document.querySelector('.hud-radio').className, null, 30000, 'hud radio lost').catch(() => 'not lost');
await sleep(1500);
const domHidden = await H.evaluate(() => [...document.querySelectorAll('.online-map-suit')].map((li) => ({ cls: li.className, left: li.style.left, top: li.style.top, text: li.textContent })));
const listHidden = await H.evaluate(() => document.querySelector('.habitat-crew')?.innerText);
check('behind the ridge the habitat map shows the last known position in grey',
  hidden.lastKnown && Math.abs(hidden.z - 474) > 30 && Math.hypot(hidden.x - second.x, hidden.z - second.z) < 25 && domHidden[0]?.cls.includes('last-known') && /lost/.test(radioOut),
  `true position (535, 474); habitat shows (${hidden.x.toFixed(1)}, ${hidden.z.toFixed(1)}) last known; surface HUD radio ${radioIn} -> ${radioOut}; DOM ${JSON.stringify(domHidden[0])}; list ${JSON.stringify(listHidden)}`);
if (SHOTS) await H.screenshot({ path: SHOTS + '/online-m4-habitat-last-known.jpg', type: 'jpeg', quality: 70 });
await habitatSees(535, 544, 'back in sight');
check('back in sight, the marker is live again', true);

// 3. a route from the habitat
await until(H, () => window.__missionStore.getState().route.path?.length > 1, null, 300000, 'habitat route planned');
const tSend = Date.now();
await H.evaluate(() => [...document.querySelectorAll('.table-primary')].find((b) => /Send route/.test(b.textContent)).click());
await until(H, () => window.__missionStore.getState().habitat.sent.route === 'confirmed', null, 60000, 'route confirmed');
const tConfirm = Date.now() - tSend;
const sentPts = await H.evaluate(() => window.__missionStore.getState().habitat.route.path.length);
const sentRaw = await H.evaluate(() => window.__missionStore.getState().route.path.length);
const sRoute = await until(S, () => { const s = window.__missionStore.getState(); return s.route.origin?.kind === 'habitat' ? { origin: s.route.origin, n: s.route.path.length, wps: s.route.waypoints.map((w) => w.name), next: s.route.nextIndex } : null; }, null, 60000, 'surface adopted');
const tAdopt = Date.now() - tSend;
const notice = await until(S, () => document.querySelector('.online-visor-notice')?.textContent, null, 20000, 'notice').catch(() => null);
const confirmText = await H.evaluate(() => document.querySelector('.table-right .tone-ok')?.textContent);
check('a route sent from the habitat becomes the surface route with a visor notice', sRoute.n === sentPts && /New route from/.test(notice || ''),
  `${sentRaw} planner points sent as ${sentPts}; confirmed on the habitat after ${tConfirm} ms ("${confirmText}"); adopted on the surface after <= ${tAdopt} ms; waypoints ${sRoute.wps.join(' | ')}, next ${sRoute.next}; notice "${notice}"`);
const hud = await S.evaluate(() => ({ wp: document.querySelector('.hud-waypoint')?.innerText.replace(/\s+/g, ' ').slice(0, 120) }));
log('surface HUD waypoint panel:', hud.wp);
if (SHOTS) await S.screenshot({ path: SHOTS + '/online-m4-surface-route-notice.jpg', type: 'jpeg', quality: 70 });

// 4. go or no-go
await H.evaluate(() => {
  const input = document.querySelector('.online-go input');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(input, 'Dust rising to the west'); input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(300);
await H.evaluate(() => document.querySelector('.online-go-no').click());
const call = await until(S, () => document.querySelector('.online-visor-call')?.innerText, null, 30000, 'call banner');
const lastCall = await until(H, () => window.__missionStore.getState().habitat.sent.go === 'confirmed' && document.querySelector('.online-go .table-note')?.innerText, null, 30000);
check('a no-go call shows on the surface visor with its reason, and as the last call on the habitat', /No-go from/.test(call) && /Dust rising/.test(call), `visor "${call.replace(/\n/g, ' / ')}"; habitat "${lastCall}"`);
if (SHOTS) await S.screenshot({ path: SHOTS + '/online-m4-surface-no-go.jpg', type: 'jpeg', quality: 70 });

// 5. a note from the habitat: click on the map, label, send
const box = await H.evaluate(() => { const r = document.querySelector('.table-map').getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.45 }; });
await H.mouse.click(box.x, box.y);
await until(H, () => !document.querySelector('.online-note input').disabled, null, 10000, 'note pick');
await H.focus('.online-note input');
await H.keyboard.type('Check the dark band');
await H.evaluate(() => [...document.querySelectorAll('.online-note .table-secondary')][0].click());
const note = await until(S, () => window.__missionStore.getState().shared.markers.find((m) => m.kind === 'note'), null, 30000, 'note on surface');
const onHabMap = await until(H, () => [...document.querySelectorAll('.online-map-note')].map((li) => li.textContent).join(','), null, 10000).catch(() => '');
check('a note dropped on the habitat map reaches the surface, labelled', note.label === 'Check the dark band' && /Check the dark band/.test(onHabMap), `at (${note.x}, ${note.z}), author ${note.author === habId ? 'habitat' : note.author}; habitat map "${onHabMap}"`);

// 6. the surface player reloads: the join panel again, then the route comes back from the welcome
await S.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
await rejoin(S);
await until(S, () => window.__missionStore?.getState().online.status === 'open', null, 300000, 'S reopen');
await toTable(S);
const back = await until(S, () => { const s = window.__missionStore.getState(); return s.route.origin?.kind === 'habitat' && s.route.waypoints.length ? { n: s.route.path.length, origin: s.route.origin } : null; }, null, 120000, 'route after reload');
await sleep(3000);   // give the table's planner time to plan over it if it were going to
const still = await S.evaluate(() => { const s = window.__missionStore.getState(); return { n: s.route.path?.length, origin: s.route.origin }; });
await beginEva(S);
const afterWalk = await S.evaluate(() => ({ n: window.__missionStore.getState().route.path?.length, origin: window.__missionStore.getState().route.origin, call: window.__missionStore.getState().habitat.go }));
check('after a reload the surface player has the habitat route again, also once out on the surface',
  back.n === sentPts && still.n === sentPts && still.origin?.at === sRoute.origin.at && afterWalk.n === sentPts,
  `path ${back.n} points, after 3 s at the table ${still.n}, in Walk ${afterWalk.n}; last call from welcome ${JSON.stringify(afterWalk.call)}`);

// 7. the habitat player sent no poses
const hSent = await H.evaluate(() => window.__sentTypes);
await S.evaluate((hid) => { window.__pFromHab = 0; window.__online.on('p', (m) => { if (m.id === hid) window.__pFromHab++; }); }, habId);
await sleep(3000);
const pFromHab = await S.evaluate(() => window.__pFromHab);
const engineSuits = await H.evaluate(() => window.__missionStore.getState().crew.length);
check('the habitat player sent no p and no tel; the surface received no p from it', !hSent.p && !hSent.tel && pFromHab === 0,
  `habitat sent ${JSON.stringify(hSent)}; surface got ${pFromHab} p from the habitat id; habitat store crew (team panel) entries ${engineSuits}`);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed in ${Math.round((Date.now() - t0) / 1000)} s`);
await closeAll();
process.exit(results.every((r) => r.ok) ? 0 : 1);
