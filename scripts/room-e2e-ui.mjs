// Online M1 UI end to end (#52, #55): join panel, crew list, shared clock, habitat seat, room full, replaced, bad code,
// Spanish. Needs a development build (window.__missionStore) served with the Worker on one origin:
//
//   NODE_ENV=development npx vite build --mode development && npm run dev:room
//   CHROME=/path/to/chrome node scripts/room-e2e-ui.mjs [outdir]
//   QA_GPU=1 CHROME=/path/to/chromium node scripts/room-e2e-ui.mjs [outdir]   (GPU through WSLg, scripts/qaBrowser.mjs)
//
// ROOM (default TEST: use a fresh code per run, the room keeps its mission start), BASE (http://localhost:8787).
// Screenshots go to outdir (default docs/qa/img). Results: docs/qa/online-m1-ui.md.
import { writeFileSync } from 'node:fs';
import { checkRenderer, launchBrowser } from './qaBrowser.mjs';
const out = process.argv[2] || 'docs/qa/img';
const BASE = process.env.BASE || 'http://localhost:8787';
const ROOM = process.env.ROOM || 'TEST';
const LOAD_MS = 15 * 60_000;
const results = [];
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launch = () => launchBrowser({ protocolTimeout: LOAD_MS });

async function open(browser, { search = '?room=' + ROOM, lang = 'en', beforeLoad } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('marswalk.language', l); } catch { /* */ } }, lang);
  if (beforeLoad) await page.evaluateOnNewDocument(beforeLoad.fn, beforeLoad.arg);
  await page.goto(BASE + '/' + search, { waitUntil: 'domcontentloaded', timeout: LOAD_MS });
  return page;
}

const online = (page) => page.evaluate(() => { const o = window.__missionStore.getState().online; return { status: o.status, code: o.code, me: o.me, crew: o.crew, closeCode: o.closeCode }; });

async function joinAs(page, { name, role }) {
  await page.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: LOAD_MS });
  const input = await page.$('.online-field input');
  await input.click({ clickCount: 3 });
  await input.type(name);
  await page.click(`.online-role input[value="${role}"]`);
  const t0 = Date.now();
  await page.click('.online-join button.start-primary');
  return t0;
}

async function shot(page, file, selector) {
  const el = selector ? await page.$(selector) : null;
  await (el || page).screenshot({ path: out + '/' + file, type: 'png' });
}

const main = async () => {
  const A = await launch(), B = await launch();
  try {
    // ---------- bad code, and the offline game still offers its start action
    const bad = await open(A, { search: '?room=IOIO' });
    await bad.waitForSelector('.start-primary', { timeout: LOAD_MS });
    const badText = await bad.$eval('.start-hero', (e) => e.textContent);
    log('bad code shows a message', badText.includes('"IOIO" is not a room code') && badText.includes('Open the mission table'), JSON.stringify(badText.slice(0, 120)));
    const noNet = await bad.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\/api\/|net-|index-.*net/.test(r.name)).map((r) => r.name));
    log('bad code opens no /api/ request', !noNet.some((n) => n.includes('/api/')), JSON.stringify(noNet));
    await bad.close();

    // ---------- A joins as surface
    const a = await open(A);
    const renderer = await checkRenderer(a);
    log('renderer', true, renderer);
    await a.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: LOAD_MS });
    const beforeJoin = await online(a);
    log('no connection before Join', beforeJoin.status === 'off', beforeJoin.status);
    await shot(a, 'online-m1-join.png');
    await joinAs(a, { name: 'Ana', role: 'surface' });
    await a.waitForFunction(() => window.__missionStore.getState().online.status === 'open', { timeout: 60_000 });
    await a.waitForSelector('.table-screen', { timeout: 60_000 });
    log('A joined and reached the mission table', true);

    // ---------- B joins as surface; A sees B within 2 s
    const b = await open(B);
    const tB = await joinAs(b, { name: 'Beto', role: 'surface' });
    await a.waitForFunction(() => window.__missionStore.getState().online.crew.length === 2, { timeout: 30_000, polling: 20 });
    const joinMs = Date.now() - tB;
    await b.waitForFunction(() => window.__missionStore.getState().online.crew.length === 2, { timeout: 30_000, polling: 20 });
    const joinMsB = Date.now() - tB;
    log('each sees the other within 2 s', joinMs < 2000 && joinMsB < 2000, `A sees B ${joinMs} ms after B pressed Join, B sees A ${joinMsB} ms`);
    await b.waitForSelector('.table-screen', { timeout: 60_000 });

    // ---------- crew tab
    await a.click('#table-tab-crew');
    await a.waitForSelector('.online-crew li:nth-child(2)');
    const crewText = await a.$eval('.table-body', (e) => e.textContent);
    log('crew tab lists both with you', crewText.includes('Ana') && crewText.includes('Beto') && crewText.includes('you') && crewText.includes(ROOM), '');
    await shot(a, 'online-m1-crew.png');

    // ---------- A begins the EVA; the clocks match
    await a.evaluate(() => { const b = [...document.querySelectorAll('.table-primary')].find((x) => /Begin EVA/.test(x.textContent)); if (b && !b.disabled) b.click(); else window.__missionStore.setState({ mode: 'walk' }); });
    await a.waitForFunction(() => window.__missionStore.getState().online.startedAtMs !== null, { timeout: 30_000 });
    await b.waitForFunction(() => typeof window.__missionStore.getState().mission.sharedStartMs === 'number', { timeout: 30_000 });
    await a.waitForFunction(() => typeof window.__missionStore.getState().mission.sharedStartMs === 'number', { timeout: 30_000 });
    await sleep(1500);
    const read = (p) => p.evaluate(() => { const m = window.__missionStore.getState().mission; const at = Date.now(); // the clock's own formula in shared mode: (now - anchor) x scale, anchor = sharedStartMs
      return { at, e: (at - m.anchorMs) / 1000 * m.timeScale, anchorIsShared: m.anchorMs === m.sharedStartMs, paused: m.paused }; });
    const diffs = [];
    for (let i = 0; i < 5; i++) {
      const [ra, rb] = await Promise.all([read(a), read(b)]);
      // both readings to the same wall time (one machine, one clock)
      const eb = rb.e + (ra.at - rb.at) / 1000;
      diffs.push(Math.abs(ra.e - eb));
      await sleep(400);
    }
    const maxDiff = Math.max(...diffs);
    log('mission clocks match within 0.1 s', maxDiff < 0.1, `max difference ${(maxDiff * 1000).toFixed(1)} ms over 5 reads`);
    // the published readings (1 s tick) agree too
    const pubs = await Promise.all([a, b].map((p) => p.evaluate(() => window.__missionStore.getState().mission.elapsedSec)));
    log('published elapsed within 1 tick', Math.abs(pubs[0] - pubs[1]) <= 1.05, JSON.stringify(pubs));

    // ---------- B leaves; A drops B within 2 s
    // back to the table: software GL in Walk starves the page so much that its pings can stop
    await a.evaluate(() => window.__missionStore.setState({ mode: 'plan' }));
    // close B's tab, as a player closing it; the browser goes after
    const tLeave = Date.now();
    await b.close({ runBeforeUnload: false });
    await a.waitForFunction(() => window.__missionStore.getState().online.crew.length === 1, { timeout: 30_000, polling: 20 });
    const leaveMs = Date.now() - tLeave;
    await B.close();
    log('closing B removes it within 2 s', leaveMs < 2000, `${leaveMs} ms`);

    // ---------- habitat
    const C = await launch();
    try {
      const c = await open(C, { lang: 'es' });
      await c.waitForSelector('.online-join button.start-primary:not([disabled])', { timeout: LOAD_MS });
      const es = await c.$eval('.online-join', (e) => e.textContent);
      log('Spanish join panel', es.includes('Entrar en la sala') && es.includes('Equipo de superficie') && es.includes('Hábitat'), '');
      await c.evaluate(() => { localStorage.setItem('marswalk.language', 'en'); });
      await joinAs(c, { name: 'Hab', role: 'habitat' });
      await c.waitForFunction(() => window.__missionStore.getState().online.me?.role === 'habitat', { timeout: 60_000 });
      await c.waitForSelector('.table-screen', { timeout: 60_000 });
      await c.click('#table-tab-route');
      const routeHtml = await c.$eval('.table-body', (e) => e.innerHTML);
      log('habitat sees no Begin EVA', !/Begin EVA|Iniciar EVA/.test(routeHtml) && routeHtml.includes('online-habitat'), '');
      await c.keyboard.press('m');
      await sleep(500);
      log('habitat stays at the table after M', (await c.evaluate(() => window.__missionStore.getState().mode)) === 'plan', '');
      const habitatCrew = await c.evaluate(() => window.__missionStore.getState().online.crew.map((e) => [e.name, e.role, e.color]));
      log('habitat sees Ana', habitatCrew.some(([n]) => n === 'Ana'), '');
      log('habitat is in the crew list without a colour', habitatCrew.some(([n, r, col]) => n === 'Hab' && r === 'habitat' && col === null), JSON.stringify(habitatCrew));
      await c.click('#table-tab-crew');
      await shot(c, 'online-m1-crew-habitat.png');

      // ---------- room full: three more surface seats from node, then a fifth surface player in the browser
      const fillers = [];
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(BASE.replace('http', 'ws') + '/api/room/' + ROOM, { headers: { Origin: BASE } });
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        const got = new Promise((r) => { ws.onmessage = (e) => { if (e.data !== 'pong' && JSON.parse(e.data).type === 'welcome') r(); }; });
        ws.send(JSON.stringify({ type: 'hello', v: 1, id: 'filler' + i + Date.now(), name: 'Filler ' + i, role: 'surface' }));
        await got;
        ws.pinger = setInterval(() => ws.send('ping'), 5000);   // the room closes sockets silent for 30 s
        fillers.push(ws);
      }
      const D = await launch();
      try {
        const d = await open(D);
        await joinAs(d, { name: 'Fifth', role: 'surface' });
        try {
          await d.waitForFunction(() => document.querySelector('.online-join')?.textContent.includes('is full'), { timeout: 30_000 });
        } catch (e) {
          console.log('  state', JSON.stringify(await online(d)), JSON.stringify(await d.evaluate(() => document.querySelector('.start-hero, .table-screen')?.textContent.slice(0, 300))));
          throw e;
        }
        const fullText = await d.$eval('.online-join', (e) => e.textContent);
        log('5th surface player sees room full', fullText.includes('Surface crew is full: all 4 seats are taken') && fullText.includes('Join as Habitat'), '');
        await shot(d, 'online-m1-room-full.png');
        await d.click('.online-join button.start-primary');
        await d.waitForFunction(() => window.__missionStore.getState().online.me?.role === 'habitat', { timeout: 30_000 });
        log('room full: joins as the other seat', true);
      } finally { await D.close(); }
      for (const ws of fillers) { clearInterval(ws.pinger); ws.close(); }
    } finally { await C.close(); }

    // ---------- replaced: a duplicated tab carries A's sessionStorage, so it has A's player id
    const id = await a.evaluate(() => sessionStorage.getItem('marswalk.online.playerId'));
    const ctx = await A.createBrowserContext();
    const dup = await ctx.newPage();
    await dup.setViewport({ width: 1366, height: 768 });
    await dup.evaluateOnNewDocument((pid) => { sessionStorage.setItem('marswalk.online.playerId', pid); localStorage.setItem('marswalk.language', 'en'); }, id);
    await dup.goto(BASE + '/?room=' + ROOM, { waitUntil: 'domcontentloaded', timeout: LOAD_MS });
    await joinAs(dup, { name: 'Ana', role: 'surface' });
    await a.waitForFunction(() => window.__missionStore.getState().online.closeCode === 4002, { timeout: 30_000 });
    // A is in Walk now; the crew tab is at the table. Read the message where the player meets it: the room badge says closed,
    // and the table's crew tab carries the message and the button.
    await a.evaluate(() => window.__missionStore.setState({ mode: 'plan' }));
    await a.waitForSelector('#table-tab-crew', { timeout: 30_000 });
    await a.click('#table-tab-crew');
    await a.waitForSelector('.online-issue', { timeout: 10_000 });
    const rep = await a.$eval('.online-issue', (e) => e.textContent);
    log('replaced tab sees the message', rep.includes('This player joined from another tab.'), '');
    await shot(a, 'online-m1-replaced.png');
    await a.evaluate(() => [...document.querySelectorAll('.online-issue button')].find((x) => x.textContent.includes('new player')).click());
    await a.waitForFunction((old) => { const o = window.__missionStore.getState().online; return o.status === 'open' && o.me && o.me.id !== old; }, { timeout: 30_000 }, id);
    await a.waitForFunction(() => window.__missionStore.getState().online.crew.length === 2, { timeout: 10_000, polling: 50 }).catch(() => {});
    console.log('  dup state', JSON.stringify(await online(dup)));
    console.log('  a state', JSON.stringify(await online(a)));
    const crewNow = await a.evaluate(() => window.__missionStore.getState().online.crew.map((e) => e.name));
    log('join as a new player works, both tabs seated', crewNow.filter((n) => n === 'Ana').length === 2, JSON.stringify(crewNow));
    await ctx.close();
  } finally {
    await A.close().catch(() => {});
    await B.close().catch(() => {});
    writeFileSync(out + '/e2e-results.json', JSON.stringify(results, null, 2));
  }
};
main().catch((e) => { console.error('E2E ERROR', e); writeFileSync(out + '/e2e-results.json', JSON.stringify(results, null, 2)); process.exit(1); });
