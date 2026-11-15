// Drives the first mission to check the return zone (src/sim/returnZone.js) in a real browser and take its screenshots:
// the table layer before the EVA, the minimap during the walk, the snap when the dust storm starts, the wrist map and
// the table during the storm. Reads the frame rate and the zone's compute time along the way.
//
//   node scripts/qa-return-zone.mjs --shots qa/return-zone
//   QA_GPU=1 node scripts/qa-return-zone.mjs --shots qa/return-zone      # headed Chrome on the GPU (WSLg recipe)
//
// Without QA_GPU it runs headless on SwiftShader, as CI machines can. QA_GPU=1 needs a display (DISPLAY, WSLg) and a
// full Chromium (CHROME_PATH or --browser), and fails when the renderer is SwiftShader.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const SHOTS = arg('shots', 'qa/return-zone');
const BASELINE = args.includes('--baseline');   // ?zone=off: the same run without the zone, for the frame-rate baseline
const GPU = process.env.QA_GPU === '1';
const [VW, VH] = arg('viewport', '1366x768').split('x').map(Number);
const browserPath = arg('browser') || process.env.CHROME_PATH
  || [process.env.HOME + '/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => existsSync(p));
if (!browserPath) { console.error('No Chromium found. Pass --browser <path>.'); process.exit(1); }
mkdirSync(SHOTS, { recursive: true });

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const server = await createServer({ server: { port: 0, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
if (GPU) { process.env.GALLIUM_DRIVER ||= 'd3d12'; process.env.DISPLAY ||= ':0'; }
const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: !GPU,
  defaultViewport: { width: VW, height: VH },
  args: GPU
    ? ['--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--window-position=-4000,-4000', `--window-size=${VW},${VH + 132}`,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-sandbox', '--mute-audio']
    : ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const report = { gpu: GPU, renderer: null, fps: {}, zone: {} };
let page;
const S = (fn, ...a) => page.evaluate(fn, ...a);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const shotOf = async (selector, name) => { const el = await page.$(selector); if (el) await el.screenshot({ path: `${SHOTS}/${name}.png` }); };
const waitFor = async (fn, seconds, label, ...a) => {
  try { await page.waitForFunction(fn, { timeout: seconds * 1000, polling: 200 }, ...a); return true; } catch { console.log('  timed out: ' + label); return false; }
};
const click = (selector) => S((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && !e.disabled); if (!el) return false; el.click(); return true; }, selector);
const key = async (code) => { await page.keyboard.down(code); await page.keyboard.up(code); };
const zoneNow = () => S(() => { const z = window.__returnZone; return z ? { kind: z.kind, events: z.events, ...z.stats, bounds: undefined } : null; });
async function fps(label, seconds = 4) {
  const samples = [];
  for (let k = 0; k < seconds * 2; k += 1) {
    if (await paused()) await resume();
    await sleep(0.5);
    if (!(await paused())) samples.push(await S(() => window.__marswalk.stats().fps));
  }
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  report.fps[label] = { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)] };
  console.log(`  fps ${label}: min ${sorted[0]?.toFixed(1)}, median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}`);
}
async function walkTo(x, z, tolerance = 2, timeoutS = 120) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < timeoutS) {
    if (await paused()) await resume();
    const d = await S((tx, tz) => {
      const m = window.__marswalk, p = m.pose();
      const yaw = Math.atan2(tx - p.x, -(tz - p.z));
      if (Math.abs(((yaw - p.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > 0.05) m.place(p.x, p.z, yaw, 0);
      m.walking(true);
      return Math.hypot(tx - p.x, tz - p.z);
    }, x, z);
    if (d < tolerance) break;
    await sleep(0.15);
  }
  await S(() => window.__marswalk.walking(false));
}
const paused = () => S(() => window.__missionStore.getState().mission.paused || !!document.querySelector('dialog[open].pause-dialog'));
async function resume() {
  for (let i = 0; i < 20; i += 1) {
    if (await S(() => !window.__missionStore.getState().mission.paused && !document.querySelector('dialog[open].pause-dialog'))) return true;
    const free = await S(() => { const b = [...document.querySelectorAll('.pause-dialog button')].find((e) => /without/i.test(e.textContent)); if (b) { b.click(); return true; } return false; });
    if (!free && i === 0 && !(await click('.eva-start-dialog .menu-resume'))) await click('.pause-dialog .menu-resume');
    await sleep(0.5);
  }
  return false;
}

try {
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error: ' + e.message));
  page.on('console', (m) => { if (/return zone/.test(m.text())) console.log('  console: ' + m.text()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('marswalk.language', 'en'); } catch { /* fine */ } });
  await page.goto(base + (BASELINE ? '?zone=off' : ''), { waitUntil: 'load', timeout: 300000 });
  report.renderer = await S(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  console.log('renderer: ' + report.renderer);
  if (GPU && /swiftshader/i.test(report.renderer)) throw new Error('QA_GPU=1 but the renderer is SwiftShader');
  await page.waitForFunction(() => { const b = document.querySelector('.start-primary'); return b && !b.disabled && window.__marswalk; }, { timeout: 300000, polling: 500 });

  // 1. The table, the zone layer before the EVA ----------------------------------------------------------------------
  await click('.start-primary');
  await waitFor(() => document.querySelector('.table-tabs'), 20, 'mission table');
  await click('#table-tab-route');
  await waitFor(() => window.__missionStore.getState().route.budget, 30, 'the plan');
  const layers = await S(() => [...document.querySelectorAll('.table-layers:not(.needs-choice) button')].map((b) => b.textContent.trim()));
  console.log('  layer buttons: ' + layers.join(' | '));
  await S(() => document.querySelectorAll('.table-layers:not(.needs-choice) button')[6]?.click());
  await waitFor(() => (window.__returnZone || location.search.includes('zone=off')) && window.__missionStore.getState().view.layer === 6, 30, 'the plan zone');
  await sleep(1.5);
  report.zone.plan = await zoneNow();
  console.log('  plan zone: ' + JSON.stringify(report.zone.plan));
  await shot('01-table-zone-plan');
  await shotOf('.table-map', '01b-table-map-zone-plan');
  await fps('table with the zone layer');

  // 2. Begin the EVA and walk to the sortie stop ---------------------------------------------------------------------
  await click('#table-tab-suit');
  await sleep(0.5);
  await click('.table-primary');
  await waitFor(() => document.querySelector('.eva-start-dialog .menu-resume'), 20, 'walk keys card');
  await click('.eva-start-dialog .menu-resume');
  if (!(await resume())) throw new Error('the EVA did not start');
  if (!BASELINE) await waitFor(() => window.__returnZone?.kind === 'live', 20, 'the live zone');
  await sleep(1);
  report.zone.start = await zoneNow();
  await shot('02-walk-start');
  const stop = await S(() => { const w = window.__missionStore.getState().route.waypoints[1]; return { x: w.x, z: w.z }; });
  // half the way out, the frame rate while walking, then the rest
  const start = await S(() => window.__marswalk.pose());
  await walkTo((start.x + stop.x) / 2, (start.z + stop.z) / 2, 2.5);
  await S(() => window.__marswalk.walking(true));
  await fps('walking with the minimap zone', 3);
  await walkTo(stop.x, stop.z, 2.5);
  report.walkedM = await S(() => window.__missionStore.getState().eva.distanceM);
  await sleep(2.5);
  report.zone.atStop = await zoneNow();
  console.log('  at the stop: ' + JSON.stringify(report.zone.atStop));
  await shot('03-walk-at-stop');
  await shotOf('.hud-map-wrap', '03b-minimap-at-stop');
  await fps('standing at the stop with the minimap zone');

  // 3. The wrist map --------------------------------------------------------------------------------------------------
  await key('KeyR');
  await waitFor(() => window.__marswalkWrist?.snapshot().open === true, 5, 'wrist up');
  await key('BracketRight');
  await sleep(1.5);
  await shot('04-wrist-map');
  await S(() => { const c = window.__marswalkWrist?.canvas; return c?.toDataURL('image/png'); }).then((url) => url && writeFileSync(`${SHOTS}/04b-wrist-canvas.png`, Buffer.from(url.split(',')[1], 'base64')));
  await key('KeyR');
  await waitFor(() => window.__marswalkWrist?.snapshot().open === false, 5, 'wrist down');
  await resume();

  // 4. Wait at the stop for the storm: the snap -----------------------------------------------------------------------
  const before = await zoneNow();
  const t0 = Date.now();
  for (let k = 0; k < 60 && !(await S(() => window.__missionStore.getState().alerts['dust-storm']?.active)); k += 1) { await resume(); await sleep(4); }
  const stormAt = Date.now();
  if (!BASELINE) await waitFor(() => window.__returnZone?.events?.includes('dust-storm'), 10, 'the zone after the storm');
  report.zone.snapMs = Date.now() - stormAt;
  report.zone.storm = await zoneNow();
  report.zone.beforeStorm = before;
  console.log(`  storm after ${((stormAt - t0) / 1000).toFixed(0)} s; zone snapped ${report.zone.snapMs} ms after the alert: ${JSON.stringify(report.zone.storm)}`);
  await sleep(0.6);
  await shot('05-storm-snap');
  await shotOf('.hud-map-wrap', '05b-minimap-storm-snap');
  await fps('walk in the storm');
  // 5. The radiation alert: the shelter window ------------------------------------------------------------------------
  for (let k = 0; k < 30 && !(await S(() => window.__missionStore.getState().alerts.radiation?.active)); k += 1) { await resume(); await sleep(2); }
  if (!BASELINE) await waitFor(() => window.__returnZone?.events?.includes('radiation'), 10, 'the zone after the radiation alert');
  await sleep(0.6);
  report.zone.radiation = await zoneNow();
  console.log('  radiation: ' + JSON.stringify(report.zone.radiation));
  await shot('06-radiation-window');
  await shotOf('.hud-map-wrap', '06b-minimap-radiation');
  await key('KeyM');
  await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'table');
  await sleep(2);
  await shot('07-table-event');
  await shotOf('.table-map', '07b-table-map-event');
} finally {
  writeFileSync(`${SHOTS}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
