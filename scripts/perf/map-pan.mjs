// Plan map pan and zoom benchmark (#344 rig). Not part of the build.
//
//   scripts/perf/build.sh origin/main main && QA_GPU=1 node scripts/perf/map-pan.mjs --dist main --runs 3 [--profile]
//
// Opens the mission table at 1920x1080 on the Route step with Perseverance's drives on, then runs one scripted 10 s
// gesture on the flat map: 6 s of drag (a pointer move every 16 ms along a loop) and 4 s of wheel zoom (in and out every
// 120 ms about moving points). It records the rAF frame times during the gesture (p50, p95, max), long tasks over 50 ms,
// React commits and the components that rendered, and 2D canvas putImageData calls. --profile saves a CDP CPU profile of
// the first run of each dist and prints its top self-time functions. Writes <out>/pan.json and <out>/pan.md.
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const DISTS = arg('dist', 'main').split(',');
const RUNS = Number(arg('runs', '3'));
const OUT = resolve(arg('out', 'scripts/perf/out/pan'));
const PROFILE = args.includes('--profile');
const [W, H] = [1920, 1080];
const GPU = process.env.QA_GPU === '1';
if (GPU) { process.env.GALLIUM_DRIVER ||= 'd3d12'; process.env.DISPLAY ||= ':0'; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  const want = GPU ? /^chromium-\d+$/ : /^chromium_headless_shell-\d+$/;
  for (const d of readdirSync(cache).filter((x) => want.test(x)).sort().reverse()) {
    const p = join(cache, d, GPU ? 'chrome-linux64/chrome' : 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (existsSync(p)) return p;
  }
  throw new Error('No Chromium found. Set CHROME_PATH.');
}
const launch = () => puppeteer.launch({
  executablePath: chromePath(), headless: GPU ? false : 'shell',
  args: GPU
    ? ['--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--window-position=-4000,-4000', `--window-size=${W},${H + 132}`,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-sandbox', '--mute-audio']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--mute-audio', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, protocolTimeout: 600000, timeout: 120000,
});

function instrument() {
  const P = { put: 0, commits: 0, names: {}, long: [], raf: [], rec: false };
  window.__pan = P;
  const tick = (t) => { if (P.rec) P.raf.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const put = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (...a) { P.put++; return put.apply(this, a); };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
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
    onCommitFiberRoot(_id, root) { if (!P.rec) return; P.commits++; try { walk(root.current.child); } catch { /* best effort */ } },
  };
}

const pct = (xs, p) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };

async function runOnce(base, dist, run) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL2'; });
    if (GPU && /swiftshader|llvmpipe|no WebGL/i.test(renderer)) throw new Error('QA_GPU=1 but the renderer is ' + renderer);
    await page.evaluateOnNewDocument(instrument);
    await page.goto(base + '?qa=1&tier=low', { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.start-primary:not([disabled])'), { timeout: 300000, polling: 250 });
    await page.evaluate(() => { const v = document.querySelector('.start-video'); if (v) v.pause(); });
    await sleep(800);
    await page.click('.start-primary');
    // The habitat-first flow (#260) starts beside the table: open it as the M key does (store.setMode('plan'))
    await page.waitForFunction(() => window.__missionStore?.getState().mode, { timeout: 180000, polling: 250 });
    await sleep(1500);
    await page.evaluate(() => { if (window.__missionStore.getState().mode !== 'plan') window.__missionStore.setState({ mode: 'plan' }); });
    await page.waitForFunction(() => document.querySelector('.table-tabs [role=tab]'), { timeout: 180000, polling: 250 });
    const route = await page.$('#table-tab-route');
    if (route) await route.click();
    await page.waitForFunction(() => window.__missionStore?.getState().route.totals && document.querySelector('.table-map canvas'), { timeout: 180000, polling: 250 });
    // Perseverance's drives on, as in the bug report
    await page.evaluate(() => { const b = document.querySelector('.table-overlay-toggle'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); });
    // the map's first exact paint, so the gesture never starts on a blank canvas
    await page.waitForFunction(() => window.__pan.put > 0, { timeout: 120000, polling: 250 });
    await sleep(2500);
    if (process.env.PAN_SHOTS) await page.screenshot({ path: join(OUT, `before-${dist}.png`) });
    const box = await (await page.$('.table-map')).boundingBox();
    if (process.env.PAN_SHOTS) log('map box', JSON.stringify(box), await page.evaluate(() => { const r = document.querySelector('.table-map').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && (el.className?.baseVal ?? el.className) + ' ' + el.tagName; }));
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.18;
    let cdp = null;
    if (PROFILE && run === 0) { cdp = await page.createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    const long0 = await page.evaluate(() => { window.__pan.rec = true; window.__pan.put = 0; return window.__pan.long.length; });
    const start = Date.now();
    // 6 s of drag: down at the centre, a loop of moves, up
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let k = 0; Date.now() - start < 6000; k++) {
      const a = k / 40;
      await page.mouse.move(cx + Math.sin(a) * r, cy + Math.sin(a * 1.7) * r * 0.6);
      if (process.env.PAN_SHOTS && k === 60) await page.screenshot({ path: join(OUT, `mid-drag-${dist}.png`) });
      await sleep(16);
    }
    await page.mouse.up();
    // 4 s of wheel zoom about moving points
    for (let k = 0; Date.now() - start < 10000; k++) {
      await page.mouse.move(cx + Math.cos(k / 5) * r * 0.5, cy + Math.sin(k / 5) * r * 0.5);
      await page.mouse.wheel({ deltaY: (Math.floor(k / 8) % 2 ? 100 : -100) });
      await sleep(120);
    }
    await sleep(600);   // the commit after the last wheel step
    if (process.env.PAN_SHOTS) await page.screenshot({ path: join(OUT, `after-${dist}.png`) });
    const res = await page.evaluate((l0) => { const P = window.__pan; P.rec = false; const long = P.long.slice(l0); return { raf: P.raf, put: P.put, commits: P.commits, names: P.names, long }; }, long0);
    let top = null;
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(join(OUT, `pan-${dist}.cpuprofile`), JSON.stringify(profile));
      const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
      top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, us]) => [k, Math.round(us / 1000)]);
    }
    const gaps = res.raf.slice(1).map((t, i) => t - res.raf[i]);
    const names = Object.fromEntries(Object.entries(res.names).sort((a, b) => b[1] - a[1]).slice(0, 8));
    return { dist, run, renderer, frames: res.raf.length, p50: +pct(gaps, 0.5).toFixed(1), p95: +pct(gaps, 0.95).toFixed(1), max: +Math.max(...gaps).toFixed(1),
      longTasks: res.long.length, longMs: Math.round(res.long.reduce((s, e) => s + e.d, 0)), putImageData: res.put, commits: res.commits, names, top };
  } finally { await browser.close(); }
}

mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const servers = {};
for (const d of DISTS) {
  const DIST = resolve('scripts/perf/out/dist-' + d);
  if (!existsSync(DIST)) throw new Error(`${DIST} missing: run scripts/perf/build.sh <ref> ${d}`);
  const server = createServer((req, res) => {
    let file = normalize(join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': statSync(file).size });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers[d] = { server, base: `http://127.0.0.1:${server.address().port}/` };
}
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) for (const d of DISTS) {
    try { const r = await runOnce(servers[d].base, d, i); runs.push(r); log(`${d} run ${i}: p50 ${r.p50} p95 ${r.p95} max ${r.max} ms, ${r.longTasks} long tasks (${r.longMs} ms), ${r.commits} commits, ${r.putImageData} putImageData`); }
    catch (e) { log(`${d} run ${i} failed: ${e.message}`); runs.push({ dist: d, run: i, error: e.message }); }
    writeFileSync(join(OUT, 'pan.json'), JSON.stringify(runs, null, 1));
  }
} finally { for (const s of Object.values(servers)) s.server.close(); }
const med = (xs) => pct(xs.filter((x) => x != null), 0.5);
const rows = ['| 10 s pan and zoom, 1920x1080, median of good runs | ' + DISTS.join(' | ') + ' |', '|---|' + DISTS.map(() => '---:').join('|') + '|'];
for (const [label, k] of [['Frame time p50 (ms)', 'p50'], ['Frame time p95 (ms)', 'p95'], ['Frame time max (ms)', 'max'], ['Long tasks over 50 ms', 'longTasks'], ['Long-task time (ms)', 'longMs'], ['React commits', 'commits'], ['putImageData calls', 'putImageData']]) {
  rows.push(`| ${label} | ` + DISTS.map((d) => med(runs.filter((r) => r.dist === d && !r.error).map((r) => r[k]))).join(' | ') + ' |');
}
writeFileSync(join(OUT, 'pan.md'), rows.join('\n') + '\n');
console.log(rows.join('\n'));
for (const r of runs.filter((x) => x.top)) { console.log(`\nTop self time, ${r.dist}:`); for (const [k, ms] of r.top) console.log(`  ${ms} ms  ${k}`); console.log('  components:', JSON.stringify(r.names)); }
