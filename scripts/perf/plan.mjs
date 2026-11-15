// Plan phase performance rig. Not part of the build.
//
//   scripts/perf/build.sh origin/main main && scripts/perf/build.sh pr282 pr282
//   node scripts/perf/plan.mjs --dist main,pr282 --runs 3 [--out scripts/perf/out/run] [--trace] [--frames] [--film]
//
// Drives the mission table headless at 1366x768 through one fixed script (open the table, idle, every tab, every
// layer, a hazard switch, add and remove a waypoint, drag and zoom the map, the suit step) and records, per step:
//   counts that do not depend on machine load: WebGL draw calls and GL frames (frames with at least one draw call)
//   per context, live WebGL contexts, React commits and the components that rendered (a stub of the React DevTools
//   hook, so no app change), 2D getImageData / putImageData / drawImage calls, long tasks over 50 ms, JS heap;
//   timings: input-to-next-paint from the Event Timing API, Begin to an interactive table, rAF frame time p50/p95
//   during the map drag.
// With several dists the runs interleave (A, B, A, B...), so a load spike on this machine hits both sides. Trust the
// counts over the times. Writes <out>/runs.json and <out>/summary.md; --trace saves a CDP trace of the first run of
// each dist. --frames saves a still of each tab and of the second map layer, plus facts.json, to <out>/frames-<dist>.
// --film records a screencast of the map drag and zoom, two tab switches and two layer toggles to
// <out>/film-<dist>-r<run>, which scripts/perf/filmstrip.py cuts into 6-frame strips.
//
// The static server, findChrome and the browser flags are those of scripts/quality/capture.mjs (#277).
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes('--' + name);
const DISTS = arg('dist', 'main').split(',');
const RUNS = Number(arg('runs', '3'));
const OUT = resolve(arg('out', 'scripts/perf/out/run'));
const TIER = arg('tier', 'low');
const IDLE_MS = Number(arg('idle', '5000'));
const [W, H] = [1366, 768];
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  if (existsSync(cache)) {
    const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
    for (const d of shells) { const p = join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell'); if (existsSync(p)) return p; }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  throw new Error('No Chromium found. Set CHROME_PATH.');
}

// ------------------------------------------------------------------ in-page counters (before any app script)
function instrument() {
  const P = { draws: 0, glFrames: 0, frame: 0, contexts: [], getImageData: 0, putImageData: 0, drawImage: 0, commits: 0, names: {}, long: [], events: [], rafTimes: [], recordRaf: false };
  window.__perf = P;
  const tick = (t) => { P.frame++; if (P.recordRaf) P.rafTimes.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = getContext.call(this, type, ...rest);
    if (c && /webgl/.test(type) && !P.contexts.some((e) => e.ctx === c)) P.contexts.push({ ctx: c, canvas: this, draws: 0, glFrames: 0, last: -1, label: this.parentElement ? this.parentElement.className : '' });
    return c;
  };
  const wrapDraw = (proto) => {
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const f = proto[m]; if (!f) continue;
      proto[m] = function (...a) {
        P.draws++;
        const e = P.contexts.find((x) => x.ctx === this);
        if (e) { e.draws++; if (e.last !== P.frame) { e.last = P.frame; e.glFrames++; P.glFrames++; } }
        return f.apply(this, a);
      };
    }
  };
  wrapDraw(WebGLRenderingContext.prototype); wrapDraw(WebGL2RenderingContext.prototype);
  for (const m of ['getImageData', 'putImageData', 'drawImage']) {
    const f = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (...a) { P[m]++; return f.apply(this, a); };
  }
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.events.push({ t: e.startTime, d: e.duration, type: e.name, id: e.interactionId }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  // React DevTools hook stub: production React calls onCommitFiberRoot on every commit.
  const name = (f) => { const t = f.type; return t && (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name))) || null; };
  const walk = (f) => {
    for (; f; f = f.sibling) {
      if ((f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) && (!f.alternate || (f.flags & 1))) {
        const n = name(f); if (n) P.names[n] = (P.names[n] || 0) + 1;
      }
      if (!f.alternate || f.child !== f.alternate.child) walk(f.child);
    }
  };
  let id = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), isDisabled: false, checkDCE() {},
    inject(r) { id++; this.renderers.set(id, r); return id; },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) { P.commits++; try { walk(root.current.child); } catch { /* best effort */ } },
  };
  P.snap = () => ({
    t: performance.now(), draws: P.draws, glFrames: P.glFrames, frame: P.frame, commits: P.commits, names: { ...P.names },
    getImageData: P.getImageData, putImageData: P.putImageData, drawImage: P.drawImage, long: P.long.length,
    longMs: P.long.reduce((s, e) => s + e.d, 0), events: P.events.length,
    contexts: P.contexts.map((e) => ({ label: e.label, live: e.canvas.isConnected && !e.ctx.isContextLost(), draws: e.draws, glFrames: e.glFrames })),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  });
}

// ------------------------------------------------------------------ steps
const snap = (page) => page.evaluate(() => window.__perf.snap());
const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, { timeout, polling: 200 }, arg);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));

function delta(a, b, page) {
  const sec = (b.t - a.t) / 1000;
  const names = {};
  for (const [k, v] of Object.entries(b.names)) { const d = v - (a.names[k] || 0); if (d) names[k] = d; }
  const ctx = b.contexts.map((c, i) => ({ label: c.label, live: c.live, draws: c.draws - (a.contexts[i]?.draws ?? 0), glFrames: c.glFrames - (a.contexts[i]?.glFrames ?? 0) }));
  return {
    sec: +sec.toFixed(2), draws: b.draws - a.draws, glFrames: b.glFrames - a.glFrames, rafFrames: b.frame - a.frame,
    commits: b.commits - a.commits, getImageData: b.getImageData - a.getImageData, putImageData: b.putImageData - a.putImageData,
    drawImage: b.drawImage - a.drawImage, longTasks: b.long - a.long, longMs: Math.round(b.longMs - a.longMs),
    liveGl: b.contexts.filter((c) => c.live).length, heapMB: b.heapMB, contexts: ctx.filter((c) => c.draws || c.live), names, page,
  };
}

/** Runs fn as one measured step: counters before and after, and the slowest Event Timing entry in between. */
async function step(page, rec, label, fn, { wait = 600 } = {}) {
  if (process.env.PERF_VERBOSE) log('  step ' + label);
  const film = FILM && FILM_STEPS.has(label) ? await startFilm(page) : null;
  const a = await snap(page);
  const ev0 = a.events;
  await fn();
  await settle(page);
  await sleep(wait);
  if (film) await stopFilm(film, label, rec);
  const b = await snap(page);
  const d = delta(a, b);
  const events = await page.evaluate((from) => window.__perf.events.slice(from), ev0);
  d.inpMs = events.length ? Math.max(...events.map((e) => e.d)) : 0;
  d.slowEvents = events.length;
  rec.steps[label] = d;
  return d;
}

// --film: a CDP screencast of the steps in FILM_STEPS, every frame the compositor produced
// with its timestamp, for the council's filmstrips (scripts/perf/filmstrip.py picks 6 and prints the times).
// The map's layer buttons. #282's NeedsPanel reuses the .table-layers class for its crew and risk choices, so match the
// map's group by its aria-label (NeedsPanel's groups use aria-labelledby).
const LAYER_BUTTONS = '.table-layers[aria-label] button';
const FILM = flag('film');
const FILM_STEPS = new Set(['map:drag', 'map:zoom', 'tab:route', 'tab:suit', 'layer:1', 'layer:2']);
async function startFilm(page) {
  const cdp = await page.createCDPSession();
  const frames = [];
  const t0 = Date.now() / 1000;
  cdp.on('Page.screencastFrame', (f) => { frames.push({ data: f.data, ts: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return { cdp, frames, t0, page };
}
async function stopFilm(film, label, rec) {
  await film.cdp.send('Page.stopScreencast').catch(() => {});
  await film.cdp.detach().catch(() => {});
  const dir = join(OUT, `film-${rec.dist}-r${rec.run}`, label.replace(':', '-'));
  mkdirSync(dir, { recursive: true });
  const meta = film.frames.map((f, i) => { const name = String(i).padStart(3, '0') + '.jpg'; writeFileSync(join(dir, name), Buffer.from(f.data, 'base64')); return { name, ms: Math.round((f.ts - film.t0) * 1000) }; });
  writeFileSync(join(dir, 'frames.json'), JSON.stringify(meta));
}

async function shot(page, dir, name) { if (dir) await page.screenshot({ path: join(dir, name + '.png') }); }

async function runOnce(browser, base, dist, runIndex, { trace, frames }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  page.on('error', (e) => { errors.push('page crashed: ' + e.message); log('page crashed: ' + e.message); });
  if (process.env.PERF_VERBOSE) page.on('console', (m) => { if (m.type() === 'error') log('console error: ' + m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(instrument);
  const rec = { dist, run: runIndex, steps: {}, errors };
  const frameDir = frames ? join(OUT, `frames-${dist}`) : null;
  if (frameDir) mkdirSync(frameDir, { recursive: true });
  await page.goto(base + `?qa=1&tier=${TIER}`, { waitUntil: 'load' });
  await waitFor(page, () => window.__missionStore && document.querySelector('.start-primary:not([disabled])'), null, 300000);
  await page.evaluate(() => { const v = document.querySelector('.start-video'); if (v) v.pause(); });
  await sleep(1000);
  rec.steps.startIdle = await (async () => { const a = await snap(page); await sleep(3000); return delta(a, await snap(page)); })();
  if (trace) await page.tracing.start({ path: join(OUT, `trace-${dist}.json`), categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute', 'disabled-by-default-v8.cpu_profiler'] });

  // Begin: the start screen's main action opens the mission table
  const begin = await step(page, rec, 'begin', async () => {
    await page.evaluate(() => { window.__perf.beginAt = performance.now(); document.querySelector('.start-primary').click(); });
    await waitFor(page, () => document.querySelector('.table-tabs [role=tab]') && !document.querySelector('dialog[open]'), null, 120000);
    await page.evaluate(() => { window.__perf.tableAt = performance.now(); });
    await waitFor(page, () => window.__missionStore.getState().route.totals && document.querySelector('.table-map canvas'), null, 180000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { window.__perf.readyAt = performance.now(); r(); }))));
  }, { wait: 200 });
  const at = await page.evaluate(() => ({ table: window.__perf.tableAt - window.__perf.beginAt, ready: window.__perf.readyAt - window.__perf.beginAt }));
  begin.tableMs = Math.round(at.table); begin.interactiveMs = Math.round(at.ready);
  await sleep(1500);

  // idle on the first step
  rec.steps.idleSite = await (async () => { const a = await snap(page); await sleep(IDLE_MS); return delta(a, await snap(page)); })();

  const tabs = await page.$$eval('.table-tabs [role=tab]', (els) => els.map((e) => e.id));
  for (const id of tabs) {
    await step(page, rec, 'tab:' + id.replace('table-tab-', ''), async () => { await page.click('#' + id); }, { wait: 900 });
    if (!id.endsWith('suit')) await shot(page, frameDir, 'tab-' + id.replace('table-tab-', ''));
    if (frameDir && id.endsWith('route')) {
      // the real values on screen, to check the council's comprehension answers against
      const facts = await page.evaluate(() => {
        const r = window.__missionStore.getState().route;
        const pressed = document.querySelector('.table-layers [aria-pressed="true"]');
        return { stops: r.waypoints.map((w) => w.name), totals: r.totals, decision: r.decision, profile: r.profile, layer: window.__missionStore.getState().view.layer, layerButton: pressed ? pressed.textContent.trim() : null };
      });
      writeFileSync(join(frameDir, 'facts.json'), JSON.stringify(facts, null, 1));
    }
    if (id.endsWith('route')) {
      rec.steps.idleRoute = await (async () => { const a = await snap(page); await sleep(IDLE_MS); return delta(a, await snap(page)); })();
      // every layer button on the route step, then back to the first
      const layers = await page.$$eval(LAYER_BUTTONS, (els) => els.length);
      for (let i = 0; i < layers; i++) {
        // a real mouse click on the button, so the Event Timing API records it
        await step(page, rec, 'layer:' + i, async () => { const buttons = await page.$$(LAYER_BUTTONS); await buttons[i].click(); }, { wait: 900 });
        if (i === 1) await shot(page, frameDir, 'layer-1');
      }
      if (layers) await step(page, rec, 'layer:back', async () => { const buttons = await page.$$(LAYER_BUTTONS); await buttons[0].click(); });
      if (await page.$('.table-overlay-toggle')) {
        await step(page, rec, 'overlay:on', () => page.click('.table-overlay-toggle'));
        await step(page, rec, 'overlay:off', () => page.click('.table-overlay-toggle'));
      }
      // map drag: 40 moves across 400 px, then 5 wheel steps in and 5 out
      const box = await (await page.$('.table-map')).boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.evaluate(() => { window.__perf.rafTimes = []; window.__perf.recordRaf = true; });
      const drag = await step(page, rec, 'map:drag', async () => {
        await page.mouse.move(cx, cy); await page.mouse.down();
        for (let k = 1; k <= 40; k++) {
          await page.mouse.move(cx - k * 10, cy - k * 4);   // no screenshots mid-drag: they pause it (use --film)
        }
        await page.mouse.up();
      });
      const times = await page.evaluate(() => { window.__perf.recordRaf = false; return window.__perf.rafTimes; });
      const gaps = times.slice(1).map((t, i) => t - times[i]).sort((x, y) => x - y);
      const q = (p) => gaps.length ? +gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))].toFixed(1) : null;
      drag.frameP50 = q(0.5); drag.frameP95 = q(0.95); drag.frameMax = gaps.length ? +gaps[gaps.length - 1].toFixed(1) : null;
      await step(page, rec, 'map:zoom', async () => {
        await page.mouse.move(cx, cy);
        for (let k = 0; k < 5; k++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(30); }
        for (let k = 0; k < 5; k++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(30); }
      });
      if (await page.$('.table-map-fit')) await step(page, rec, 'map:fit', () => page.click('.table-map-fit'));
      // add a waypoint between the first two, wait for the replan, then remove it
      const add = async (on) => {
        await page.evaluate((on2) => {
          const s = window.__missionStore;
          const r = s.getState().route;
          if (on2) {
            const [a, b] = r.waypoints;
            const w = { name: 'PERF · test stop', x: (a.x + b.x) / 2 + 20, z: (a.z + b.z) / 2 + 20 };
            s.setState((st) => ({ route: { ...st.route, waypoints: [st.route.waypoints[0], w, ...st.route.waypoints.slice(1)] } }));
          } else {
            s.setState((st) => ({ route: { ...st.route, waypoints: st.route.waypoints.filter((x) => x.name !== 'PERF · test stop') } }));
          }
          window.__perf.pathBefore = s.getState().route.path;
        }, on);
        await waitFor(page, () => window.__missionStore.getState().route.path && window.__missionStore.getState().route.path !== window.__perf.pathBefore, null, 15000).catch(() => {});   // #282 keeps the path for a stop it does not route through
      };
      await step(page, rec, 'waypoint:add', () => add(true), { wait: 1200 });
      await step(page, rec, 'waypoint:remove', () => add(false), { wait: 1200 });
    }
    if (id.endsWith('hazards')) {
      const sw = await page.$('.table-hazards input[type=checkbox]:not([disabled]), .table-hazard-cards button[aria-pressed]:not([disabled]), .table-hazards [role=switch]:not([disabled])');
      if (sw) { await step(page, rec, 'hazard:toggle', () => sw.click()); await step(page, rec, 'hazard:back', () => sw.click()); }
    }
    if (id.endsWith('suit')) {
      await sleep(2000);
      rec.steps.idleSuit = await (async () => { const a = await snap(page); await sleep(IDLE_MS); return delta(a, await snap(page)); })();
      await shot(page, frameDir, 'tab-suit');
    }
  }
  // back to the first step: is the suit's renderer gone?
  await step(page, rec, 'tab:back', () => page.click('#' + tabs[0]), { wait: 1500 });
  rec.steps.idleAfter = await (async () => { const a = await snap(page); await sleep(IDLE_MS); return delta(a, await snap(page)); })();
  // the suit step a second time: a player going back to check the suit
  const suitTab = tabs.find((x) => x.endsWith('suit'));
  if (suitTab) { await step(page, rec, 'tab:suit2', () => page.click('#' + suitTab), { wait: 1500 }); await step(page, rec, 'tab:back2', () => page.click('#' + tabs[0]), { wait: 900 }); }
  if (trace) await page.tracing.stop();
  await page.close();
  return rec;
}

// ------------------------------------------------------------------ summary
const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
function summarise(runs) {
  const rows = [];
  const per = (st, k) => (st && st.sec ? +(st[k] / st.sec).toFixed(1) : null);
  const metrics = [
    ['Begin to table on screen (ms)', (r) => r.steps.begin?.tableMs],
    ['Begin to interactive table (ms)', (r) => r.steps.begin?.interactiveMs],
    ['Idle, site step: GL frames/s', (r) => per(r.steps.idleSite, 'glFrames')],
    ['Idle, site step: draw calls/s', (r) => per(r.steps.idleSite, 'draws')],
    ['Idle, site step: React commits/s', (r) => per(r.steps.idleSite, 'commits')],
    ['Idle, site step: long tasks/s', (r) => per(r.steps.idleSite, 'longTasks')],
    ['Idle, route step: GL frames/s', (r) => per(r.steps.idleRoute, 'glFrames')],
    ['Idle, route step: React commits/s', (r) => per(r.steps.idleRoute, 'commits')],
    ['Idle, suit step: GL frames/s', (r) => per(r.steps.idleSuit, 'glFrames')],
    ['Idle, suit step: live WebGL contexts', (r) => r.steps.idleSuit?.liveGl],
    ['Idle after suit: live WebGL contexts', (r) => r.steps.idleAfter?.liveGl],
    ['Suit step first open: input to paint (ms)', (r) => r.steps['tab:suit']?.inpMs],
    ['Suit step first open: long task ms', (r) => r.steps['tab:suit']?.longMs],
    ['Suit step reopened: input to paint (ms)', (r) => r.steps['tab:suit2']?.inpMs],
    ['Suit step reopened: long task ms', (r) => r.steps['tab:suit2']?.longMs],
    ['Map drag: React commits', (r) => r.steps['map:drag']?.commits],
    ['Map drag: putImageData calls', (r) => r.steps['map:drag']?.putImageData],
    ['Map drag: long tasks', (r) => r.steps['map:drag']?.longTasks],
    ['Map drag: frame p50 (ms)', (r) => r.steps['map:drag']?.frameP50],
    ['Map drag: frame p95 (ms)', (r) => r.steps['map:drag']?.frameP95],
    ['Map drag: slowest input to paint (ms)', (r) => r.steps['map:drag']?.inpMs],
    ['Map zoom: putImageData calls', (r) => r.steps['map:zoom']?.putImageData],
    ['Map zoom: slowest input to paint (ms)', (r) => r.steps['map:zoom']?.inpMs],
    ['Tab switch: slowest input to paint (ms)', (r) => Math.max(0, ...Object.entries(r.steps).filter(([k]) => k.startsWith('tab:')).map(([, s]) => s.inpMs))],
    ['Tab switch: React commits (all tabs)', (r) => Object.entries(r.steps).filter(([k]) => k.startsWith('tab:')).reduce((s, [, x]) => s + x.commits, 0)],
    ['Layer toggle: slowest input to paint (ms)', (r) => Math.max(0, ...Object.entries(r.steps).filter(([k]) => k.startsWith('layer:')).map(([, s]) => s.inpMs))],
    ['Layer toggle: long tasks (all layers)', (r) => Object.entries(r.steps).filter(([k]) => k.startsWith('layer:')).reduce((s, [, x]) => s + x.longTasks, 0)],
    ['Waypoint add: slowest input to paint (ms)', (r) => r.steps['waypoint:add']?.inpMs],
    ['Waypoint add+remove: React commits', (r) => (r.steps['waypoint:add']?.commits ?? 0) + (r.steps['waypoint:remove']?.commits ?? 0)],
    ['Whole script: getImageData calls', (r) => Object.values(r.steps).reduce((s, x) => s + (x.getImageData || 0), 0)],
    ['JS heap at the end (MB)', (r) => r.steps.idleAfter?.heapMB],
  ];
  const dists = [...new Set(runs.map((r) => r.dist))];
  rows.push(`| Metric (median of the good runs, ${RUNS} tried) | ${dists.join(' | ')} |`, `|---|${dists.map(() => '---:').join('|')}|`);
  for (const [label, fn] of metrics) rows.push(`| ${label} | ${dists.map((d) => { const m = median(runs.filter((r) => r.dist === d && r.steps.begin).map(fn)); return m == null ? 'n/a' : m; }).join(' | ')} |`);
  return rows.join('\n');
}

// ------------------------------------------------------------------ main
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const servers = {};
for (const d of DISTS) {
  const DIST = resolve('scripts/perf/out/dist-' + d);
  if (!existsSync(DIST)) throw new Error(`${DIST} missing: run scripts/perf/build.sh <ref> ${d}`);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    const size = statSync(file).size, type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
    } else { res.writeHead(200, { 'Content-Type': type, 'Content-Length': size }); createReadStream(file).pipe(res); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers[d] = { server, base: `http://127.0.0.1:${server.address().port}/` };
}
// QA_GPU=1: headed Chromium on the WSLg X server, rendering on the real GPU through Mesa's d3d12 driver (the recipe in
// ~/.local/share/marswalk/gpu-chrome.md). The window sits off screen. The default stays headless SwiftShader, which
// any machine has, but its frame times say nothing about a real laptop: base decisions on the GPU numbers.
const GPU = process.env.QA_GPU === '1';
if (GPU) { process.env.GALLIUM_DRIVER ||= 'd3d12'; process.env.DISPLAY ||= ':0'; }
const gpuChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) { const p = join(cache, d, 'chrome-linux64/chrome'); if (existsSync(p)) return p; }
  throw new Error('QA_GPU=1 needs the full Chromium (not the headless shell). Set CHROME_PATH.');
};
const launch = () => puppeteer.launch(GPU ? {
  executablePath: gpuChrome(), headless: false,
  args: ['--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--window-position=-4000,-4000', `--window-size=${W},${H + 132}`,
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, protocolTimeout: 600000, timeout: 120000,
} : {
  executablePath: findChrome(), headless: 'shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox', '--enable-precise-memory-info', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, protocolTimeout: 600000, timeout: 300000,
});
// One browser per run: a crashed renderer or GPU process (seen once in a few dozen runs) then costs one run, not the
// rest, and no run inherits another's caches or contexts.
async function checkRenderer(browser) {
  const probe = await browser.newPage();
  const renderer = await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL2'; });
  await probe.close();
  if (GPU && /swiftshader|llvmpipe|no WebGL/i.test(renderer)) throw new Error('QA_GPU=1 but the renderer is ' + renderer);
  return renderer;
}
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    for (const d of DISTS) {
      log(`run ${i + 1}/${RUNS} ${d}`);
      const browser = await launch();
      try {
        const renderer = await checkRenderer(browser);
        if (i === 0 && d === DISTS[0]) { log('renderer: ' + renderer); writeFileSync(join(OUT, 'renderer.txt'), renderer + '\n'); }
        const r = await runOnce(browser, servers[d].base, d, i, { trace: flag('trace') && i === 0, frames: flag('frames') && i === 0 });
        r.renderer = renderer;
        runs.push(r);
        log(`  begin ${r.steps.begin?.interactiveMs} ms, idle GL ${r.steps.idleSite?.glFrames} frames, drag p95 ${r.steps['map:drag']?.frameP95} ms, errors ${r.errors.length}`);
      } catch (e) {
        console.error(`${d} run ${i}: ${e.message}`); runs.push({ dist: d, run: i, steps: {}, errors: [String(e.message)] });
        if (/renderer is/.test(e.message)) throw e;
      } finally { await browser.close().catch(() => {}); }
      writeFileSync(join(OUT, 'runs.json'), JSON.stringify(runs, null, 1));
    }
  }
} finally {
  for (const s of Object.values(servers)) s.server.close();
}
const md = summarise(runs);
writeFileSync(join(OUT, 'summary.md'), md + '\n');
console.log(md);
