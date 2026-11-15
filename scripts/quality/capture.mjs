// Screenshot capture and safety checks for the UI council (#277). Not part of the build.
//
//   npm run build && node scripts/quality/capture.mjs [--out dir] [--size 1366x768] [--states a,b] [--draw]
//
// Serves dist/ with a small static server (the same files `vite preview` serves; vite preview stalls on a loaded machine), opens one headless Chromium (puppeteer-core is already a devDependency; the
// browser comes from CHROME_PATH or the Playwright cache), walks the fixed demo path through the ?qa=1 hooks in
// src/qa.js and, for each state, saves a screenshot and measures the hard gates described in README.md. Every
// number is a layout or render count, so none of them depends on CPU speed. Writes <out>/metrics.json.
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes('--' + name);
const OUT = resolve(arg('out', 'scripts/quality/out/current'));
const [W, H] = arg('size', '1366x768').split('x').map(Number);
const ONLY = arg('states', '') ? arg('states').split(',') : null;
const DRAW = flag('draw');
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if (existsSync(p)) return p;
  }
  const cache = join(homedir(), '.cache/ms-playwright');
  if (existsSync(cache)) {
    // the headless shell starts faster and lighter than the full browser on a loaded machine
    const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
    for (const d of shells) { const p = join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell'); if (existsSync(p)) return p; }
    const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) { const p = join(cache, d, 'chrome-linux64/chrome'); if (existsSync(p)) return p; }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  throw new Error('No Chromium found. Set CHROME_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ in-page measurement
// Runs in the page. A "box" is the outermost visible element with its own painted background or border (a panel,
// card, chip or button group). Nested boxes belong to their outer box. Full-screen layers (canvas, visor frame,
// dialog backdrops) are not boxes.
function measurePage(opts) {
  const vw = innerWidth, vh = innerHeight;
  const TERRAIN = [107, 74, 53];   // mid Mars terrain, the background behind HUD text with no panel
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      if (e.tagName === 'DIALOG' && !e.open) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const painted = (el) => {
    const s = getComputedStyle(el);
    const bg = parse(s.backgroundColor);
    const hasBg = (bg && bg[3] > 0.08) || (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url('));
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].filter((k) => parseFloat(s['border' + k + 'Width']) > 0 && (parse(s['border' + k + 'Color']) || [0, 0, 0, 0])[3] > 0.1).length >= 3;
    return hasBg || hasBorder || s.backdropFilter !== 'none';
  };
  const fullScreen = (r) => r.width * r.height > vw * vh * 0.6;
  const skip = (el) => el.matches('canvas, video, .engine-view, .engine-view *, .visor-frame, .visor-frame *, html, body, #root, .app, .start-video, .start-shade, .loading-screen *');

  // an open modal makes the page behind it inert: only measure what sits on top
  const modalRoot = document.querySelector(':modal');
  const all = [...(modalRoot || document.body).querySelectorAll('*')];
  const boxes = [];
  for (const el of all) {
    if (skip(el) || !painted(el) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || fullScreen(r)) continue;
    boxes.push({ el, r });
  }
  // outermost only
  const outer = boxes.filter((b) => !boxes.some((o) => o !== b && o.el.contains(b.el)));
  const describe = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const clip = (r) => ({ x: Math.max(0, r.left), y: Math.max(0, r.top), r: Math.min(vw, r.right), b: Math.min(vh, r.bottom) });

  // overlap: pairwise intersection area of outermost boxes, clipped to the viewport
  let overlap = 0; const overlaps = [];
  for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) {
    const a = clip(outer[i].r), b = clip(outer[j].r);
    const w = Math.min(a.r, b.r) - Math.max(a.x, b.x), h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    if (w > 1 && h > 1) {
      // a modal over the page covers by design: skip pairs where one box sits in an open modal dialog and the other does not
      const da = outer[i].el.closest('dialog[open], [aria-modal="true"]'), db = outer[j].el.closest('dialog[open], [aria-modal="true"]');
      if (da !== db) continue;
      overlap += w * h; overlaps.push([describe(outer[i].el), describe(outer[j].el), Math.round(w * h)]);
    }
  }
  // offscreen: boxes cut by the viewport edge (more than 2 px outside)
  const offscreen = outer.filter((b) => b.r.left < -2 || b.r.top < -2 || b.r.right > vw + 2 || b.r.bottom > vh + 2).map((b) => describe(b.el));

  // texts: elements with their own non-empty text node
  const texts = [];
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'text') continue;
    if (skip(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    texts.push(el);
  }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => [0, 1, 2].map((k) => fg[k] * fg[3] + bg[k] * (1 - fg[3]));
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (skip(e) && e !== el) break;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let bg = TERRAIN;
    for (let k = layers.length - 1; k >= 0; k--) bg = blend(layers[k], bg);
    return bg;
  };
  let tinyText = 0, lowContrast = 0; const tiny = [], low = [];
  const fonts = new Set();
  for (const el of texts) {
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    fonts.add(s.fontFamily.split(',')[0].replace(/["']/g, '').trim());
    if (size < 11) { tinyText++; tiny.push(describe(el) + ' ' + size.toFixed(1) + 'px "' + el.textContent.trim().slice(0, 24) + '"'); }
    const fg = parse(el.tagName === 'text' ? s.fill : s.color) || [255, 255, 255, 1];
    const op = [...(function* () { for (let e = el; e && e.nodeType === 1; e = e.parentElement) yield Number(getComputedStyle(e).opacity); })()].reduce((a, b) => a * b, 1);
    const bg = bgOf(el);
    const c = blend([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(c), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) { lowContrast++; low.push(describe(el) + ' ' + ratio.toFixed(2) + ' "' + el.textContent.trim().slice(0, 24) + '"'); }
  }
  const radii = new Set(), panelBgs = new Set();
  for (const b of boxes) {
    const s = getComputedStyle(b.el);
    radii.add(s.borderTopLeftRadius);
    const c = parse(s.backgroundColor); if (c && c[3] > 0.08) panelBgs.add(c.map((v, k) => (k === 3 ? v.toFixed(2) : Math.round(v / 8) * 8)).join(','));
  }
  // HUD widgets: outermost boxes inside the helmet HUD and its satellites (layer chip, event banner, stop card)
  const hudBoxes = outer.filter((b) => b.el.closest('.hud, .event-banner-walk, .layer-chip, .partner-panel, .stop-card-walk, .finds, .gamepad-hint, .event-debug'));
  // required information: each check is a list of selectors; any visible one with text passes
  const req = {};
  for (const [name, sels] of Object.entries(opts.required || {})) {
    req[name] = sels.some((sel) => [...document.querySelectorAll(sel)].some((el) => visible(el) && el.textContent.trim().length > 0 && (() => { const r = el.getBoundingClientRect(); return r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh; })()));
  }
  return {
    overlap: Math.round(overlap), overlaps,
    offscreen: offscreen.length, offscreenList: offscreen,
    tinyText, tiny: tiny.slice(0, 40),
    lowContrast, low: low.slice(0, 40),
    hudCount: hudBoxes.length, hudList: hudBoxes.map((b) => describe(b.el)),
    styleDrift: { fonts: [...fonts], radii: [...radii], panelBgs: [...panelBgs], count: fonts.size + radii.size + panelBgs.size },
    boxes: outer.length,
    required: req,
  };
}

// ------------------------------------------------------------------ required information per state
const R = {
  o2: ['.hud-suit .hud-row-head b', '.hud-walkback b', '[data-required="o2"]'],
  waypoint: ['.hud-wp-name b', '.hud-wp-marker-name', '[data-required="waypoint"]'],
  distance: ['.hud-wp-cell b', '.hud-wp-marker-range', '[data-required="distance"]'],
  heading: ['.hud-heading-box', '[data-required="heading"]'],
  alert: ['.event-banner-walk', '.event-banner', '[data-required="alert"]'],
  route: ['.table-stops', '.table-map', '.mission-map', '[data-required="route"]'],
  decision: ['.table-primary', '.table-decision', '[data-required="decision"]'],
  stats: ['.debrief-stat', '.debrief-stats', '.debrief dl', '[data-required="stats"]'],
};
const WALK = { o2: R.o2, waypoint: R.waypoint, distance: R.distance, heading: R.heading };

// ------------------------------------------------------------------ driving the app
async function waitFor(page, fn, arg, timeout = 60000) {
  return page.waitForFunction(fn, { timeout, polling: 250 }, arg);
}

async function boot(page, base, query = '') {
  await page.goto(base + '?qa=1' + query, { waitUntil: 'load' });
  await waitFor(page, () => window.__marswalkQa && window.__marswalkQa.engine && document.querySelector('.start-dialog'), null, 240000);
  await page.evaluate(() => { const v = document.querySelector('.start-video'); if (v) { v.pause(); v.currentTime = 0; } });
  await sleep(800);
}

const store = (page, fn, a) => page.evaluate(fn, a);

async function clickText(page, selector, re) {
  const ok = await page.evaluate((sel, src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.querySelectorAll(sel)].find((e) => rx.test(e.textContent) && !e.disabled);
    if (!el) return false; el.click(); return true;
  }, selector, re.source);
  if (!ok) throw new Error(`no ${selector} matching ${re}`);
}

async function toTable(page) {
  await page.evaluate(() => document.querySelector('.start-primary').click());
  await waitFor(page, () => document.querySelector('.table-tabs') && window.__missionStore.getState().mode === 'plan' && !document.querySelector('dialog[open]'));
  await waitFor(page, () => window.__missionStore.getState().route.waypoints.length > 1 && window.__missionStore.getState().route.totals, null, 120000);
  await sleep(1500);
}

async function tab(page, id) {
  await page.click('#table-tab-' + id);
  await sleep(900);
}

async function toWalk(page) {
  await tab(page, 'suit');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.table-primary')].find((e) => !e.disabled);
    b.click();
  });
  // KEYS view: Start walking. Headless Chromium may refuse pointer lock; then take drag-to-look from the menu.
  await waitFor(page, () => document.querySelector('dialog[open] [data-autofocus="true"], dialog[open] .ui-button.primary'));
  await sleep(500);
  await page.evaluate(() => document.querySelector('dialog[open] [data-autofocus="true"], dialog[open] .ui-button.primary').click());
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const state = await page.evaluate(() => ({ dialog: !!document.querySelector('dialog[open]'), ghost: [...document.querySelectorAll('dialog[open] .ui-button.ghost')].map((b) => b.textContent) }));
    if (!state.dialog) break;
    if (i === 6) {
      // the drag-to-look offer is the first ghost button in the pause menu after a refused capture
      await page.evaluate(() => { const b = document.querySelector('dialog[open] .menu-actions .ui-button.ghost'); if (b) b.click(); });
    }
  }
  await waitFor(page, () => !document.querySelector('dialog[open]') && window.__missionStore.getState().mode === 'walk');
  await sleep(500);
}

async function faceNext(page) {
  await page.evaluate(() => {
    const s = window.__missionStore.getState();
    const wp = s.route.waypoints[s.route.nextIndex] || s.route.waypoints[1];
    const p = window.__marswalk.pose();
    window.__marswalk.place(p.x, p.z, Math.atan2(wp.x - p.x, -(wp.z - p.z)), -0.08);
  });
}

async function outside(page) {
  await page.evaluate(() => window.__marswalk.airlock());
  await sleep(300);
  // a few metres out of the airlock, towards the first waypoint, so the EVA counts as begun
  await page.evaluate(() => {
    const s = window.__missionStore.getState();
    const wp = s.route.waypoints[1];
    const p = window.__marswalk.pose();
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    const x = p.x + (wp.x - p.x) / d * 14, z = p.z + (wp.z - p.z) / d * 14;
    window.__marswalk.place(x, z, Math.atan2(wp.x - x, -(wp.z - z)), -0.08);
  });
  await partner(page);
  await waitFor(page, () => window.__missionStore.getState().eva.phase === 'active', null, 30000).catch(() => {});
  await sleep(2500);
}

async function partner(page) {
  await page.evaluate(() => { const p = window.__marswalk.pose(); window.__marswalkQa.partnerNear(p.x, p.z); });
}

// Walk in 5 m steps at a sped-up mission clock, so the EVA clock, oxygen, margin and the debrief's distance read
// like a real walk instead of a teleport. The EVA runner samples every 200 ms, so each step is one short stride.
async function walkToward(page, target, { stopAt = 3, timeScale = 30 } = {}) {
  await page.evaluate(async ({ tx, tz, stopAt, timeScale }) => {
    const store = window.__missionStore;
    const setScale = (k) => store.setState((st) => ({ mission: { ...st.mission, timeScale: k } }));
    setScale(timeScale);
    const STEP = 5;
    for (let n = 0; n < 2000; n++) {
      const p = window.__marswalk.pose();
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d <= stopAt) break;
      const k = Math.min(STEP, d - stopAt) / d;
      const x = p.x + dx * k, z = p.z + dz * k;
      window.__marswalk.place(x, z, Math.atan2(dx, -dz), -0.08);
      if (n % 8 === 0) window.__marswalkQa.partnerNear(x, z);
      await new Promise((r) => setTimeout(r, 210));
    }
    window.__marswalkQa.partnerNear(window.__marswalk.pose().x, window.__marswalk.pose().z);
    setScale(1);
  }, { tx: target.x, tz: target.z, stopAt, timeScale });
}

async function walkTo(page, index) {
  const wp = await page.evaluate((i) => window.__missionStore.getState().route.waypoints[i], index);
  await walkToward(page, wp, { stopAt: 1, timeScale: 10 });   // the scripted storm comes at 8 min: reach the stop first
  await waitFor(page, (i) => window.__missionStore.getState().route.visited.length >= i, index, 20000).catch(() => {});
  await sleep(700);
}

async function shot(page, name) {
  await sleep(600);
  const file = join(OUT, name + '.png');
  await page.screenshot({ path: file });
  return file;
}

// ------------------------------------------------------------------ the demo path
const STATES = [];
const state = (name, required, run) => STATES.push({ name, required, run });

state('start', {}, async () => {});
state('table-site', { route: R.route }, async (page) => { await toTable(page); });
state('table-route', { route: R.route, decision: R.decision }, async (page) => { await tab(page, 'route'); });
state('table-hazards', { route: R.route }, async (page) => { await tab(page, 'hazards'); });
state('table-suit', { decision: R.decision }, async (page) => { await tab(page, 'suit'); });
state('walk', WALK, async (page) => { await toWalk(page); await outside(page); await faceNext(page); await sleep(1200); });
state('walk-stop', WALK, async (page) => {
  // visit the route in order until the first waypoint that opens a science card
  const n = await page.evaluate(() => window.__missionStore.getState().route.waypoints.length);
  for (let i = 1; i < n - 1; i++) {
    await walkTo(page, i);
    if (await page.evaluate(() => !!document.querySelector('.stop-card-walk'))) break;
  }
  await faceNext(page);
  await waitFor(page, () => document.querySelector('.stop-card-walk'), null, 5000).catch(() => {});
});
state('walk-storm', { ...WALK, alert: R.alert }, async (page) => {
  await page.keyboard.press('Enter');   // close the science card
  await sleep(400);
  await page.evaluate(() => window.__marswalkQa.fireEvent('dust-storm'));
  await waitFor(page, () => window.__missionStore.getState().environment.dustOpacity >= 0.7 && document.querySelector('.event-banner-walk'), null, 60000).catch(() => {});
  await faceNext(page);
  await sleep(1500);
});
state('wrist', {}, async (page) => {
  await page.keyboard.press('KeyR');
  await waitFor(page, () => document.querySelector('.hint'), null, 8000).catch(() => {});
  await sleep(2200);
});
state('pause', {}, async (page) => {
  await page.keyboard.press('KeyR');
  await sleep(800);
  await page.keyboard.press('Escape');
  await waitFor(page, () => document.querySelector('dialog[open] .menu-actions'), null, 8000);
});
state('debrief', { stats: R.stats }, async (page) => {
  // resume (drag-to-look), walk back to the habitat and end the EVA with X
  await page.evaluate(() => document.querySelector('dialog[open] .ui-button.primary').click());
  await waitFor(page, () => !document.querySelector('dialog[open]'));
  const hab = await page.evaluate(() => { const w = window.__missionStore.getState().route.waypoints[0]; return { x: w.x, z: w.z }; });
  await walkToward(page, hab, { stopAt: 12 });
  await page.evaluate(() => window.__marswalk.insideHabitat());
  await partner(page);
  await waitFor(page, () => window.__missionStore.getState().eva.atHabitat === true, null, 20000);
  await sleep(500);
  await page.keyboard.press('KeyX');
  await waitFor(page, () => window.__missionStore.getState().eva.summary && document.querySelector('.debrief, [class*="debrief"]'), null, 20000);
  await sleep(1500);
});

// draw calls and triangles at three fixed poses, per tier
async function drawStats(page, base) {
  const out = {};
  for (const tier of ['low', 'high']) {
    await boot(page, base, '&tier=' + tier);
    await toTable(page);
    await toWalk(page);
    out[tier] = {};
    for (const [pose, fn] of [['airlock', 'airlock'], ['outsideHabitat', 'outsideHabitat'], ['cheyava', 'cheyavaView']]) {
      await page.evaluate((f) => window.__marswalk[f](), fn);
      await sleep(2500);
      const s = await page.evaluate(() => window.__marswalk.stats());
      out[tier][pose] = { calls: s.drawCalls, triangles: s.triangles, tier: s.tier };
    }
  }
  return out;
}

// ------------------------------------------------------------------ main
mkdirSync(OUT, { recursive: true });
const DIST = resolve(arg('dist', 'dist'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(DIST, 'index.html');
  const size = statSync(file).size, type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: process.platform === 'win32' ? true : 'shell',
  args: [...(process.platform === 'win32' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  protocolTimeout: 300000,
  timeout: 240000,
});
const result = { size: `${W}x${H}`, at: new Date().toISOString(), states: {}, errors: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => result.errors.push(String(e.message || e).slice(0, 300)));
  page.setDefaultTimeout(120000);
  log('booting ' + base);
  await boot(page, base, '&tier=low');
  log('booted');
  for (const s of STATES) {
    try {
      await s.run(page);
    } catch (e) {
      result.states[s.name] = { error: String(e.message || e).slice(0, 300) };
      console.error(`${s.name}: ${e.message}`);
      break;   // later states depend on this one
    }
    if (ONLY && !ONLY.includes(s.name)) continue;
    const file = await shot(page, s.name);
    const m = await page.evaluate(measurePage, { required: s.required });
    const facts = await page.evaluate(() => {
      const st = window.__missionStore.getState();
      const wp = st.route.shelter ? { name: st.route.shelter.name || 'HAB' } : st.route.waypoints[st.route.nextIndex];
      return {
        o2Pct: st.suit.oxygenPct, marginSec: st.suit.marginSec, waypoint: wp ? wp.name : null, rangeM: st.navigation.waypointRangeM,
        headingDeg: st.navigation.headingDeg, decision: st.route.decision, etaSec: st.route.totals ? st.route.totals.timeSec : st.route.etaSec,
        totals: st.route.totals ? { timeSec: st.route.totals.timeSec, marginSec: st.route.totals.marginSec } : null,
        hazardsOff: st.hazards.off, alerts: Object.values(st.alerts).filter((a) => a && a.active).map((a) => ({ id: a.eventId, level: a.level })),
        summary: st.eva.summary ? { outsideSec: st.eva.summary.outsideSec, distanceM: st.eva.summary.distanceM, minMarginSec: st.eva.summary.minMarginSec } : null,
      };
    });
    result.states[s.name] = { screenshot: file, facts, ...m };
    const miss = Object.entries(m.required).filter(([, v]) => !v).map(([k]) => k);
    log(`${s.name.padEnd(14)} overlap ${String(m.overlap).padStart(6)}  off ${m.offscreen}  tiny ${String(m.tinyText).padStart(3)}  lowC ${String(m.lowContrast).padStart(3)}  hud ${String(m.hudCount).padStart(2)}  drift ${m.styleDrift.count}${miss.length ? '  MISSING ' + miss.join(',') : ''}`);
  }
  if (DRAW) {
    result.draw = await drawStats(page, base);
    for (const [tier, poses] of Object.entries(result.draw)) console.log(`draw ${tier}: ` + Object.entries(poses).map(([k, v]) => `${k} ${v.calls} calls ${Math.round(v.triangles / 1000)}k tris`).join(', '));
  }
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise((r) => server.close(r));
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(result, null, 2));
console.log('wrote ' + join(OUT, 'metrics.json'));
