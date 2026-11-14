// Measures the frame rate of the scene on this machine, per quality tier and situation.
//
//   npm run measure
//   npm run measure -- --browser "C:/path/to/chrome.exe" --seconds 15
//
// Starts the Vite dev server (the measuring hook window.__marswalk only exists in development),
// opens a real, visible browser window at the screen's size and pixel ratio, and for each tier
// (forced with ?tier=high and ?tier=low) measures four situations: standing outdoors, walking,
// inside the habitat, and Plan mode. Frame times are taken from requestAnimationFrame, which drives
// the engine's render loop. Close Blender (or set its viewport to Solid) and plug in the laptop first.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const SECONDS = Number(arg('seconds', 10));
const WARMUP = 3;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const browserPath = arg('browser') || CANDIDATES.find((p) => p && existsSync(p));
if (!browserPath) { console.error('No Chrome or Edge found. Pass --browser <path to chrome or msedge>.'); process.exit(1); }

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

// Frame times from requestAnimationFrame over `seconds`: average fps and the 1 % low (99th percentile frame time).
const SAMPLE = (seconds) => new Promise((resolve) => {
  const t = []; let last = performance.now(); const end = last + seconds * 1000;
  const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else {
    const sorted = [...t].sort((a, b) => a - b), avg = t.reduce((a, b) => a + b, 0) / t.length, p99 = sorted[Math.floor(sorted.length * 0.99)];
    resolve({ fps: Math.round(1000 / avg), low1: Math.round(1000 / p99), frames: t.length });
  } };
  requestAnimationFrame(f);
});

// Each setup runs in the page (page.evaluate serialises the function), using the development hook.
// Mode changes go through the mission store, because the app pauses safely if the engine releases
// pointer lock outside a store change (the Plan switch is a real mode change, not a debug shortcut).
const CASES = [
  ['Walk, standing outdoors', () => { window.__missionStore.setState({ mode: 'walk' }); window.__marswalk.walking(false); window.__marswalk.place(8, 70, -0.11, 0); }],
  ['Walk, walking outdoors', () => { window.__missionStore.setState({ mode: 'walk' }); window.__marswalk.place(8, 70, -0.11, 0); window.__marswalk.walking(true); }],
  ['Walk, inside the habitat', () => { window.__missionStore.setState({ mode: 'walk' }); window.__marswalk.walking(false); window.__marswalk.insideHabitat(); }],
  ['Plan', () => { window.__marswalk.walking(false); window.__missionStore.setState({ mode: 'plan' }); }],
];

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ executablePath: browserPath, headless: false, defaultViewport: null, args: ['--start-maximized', '--ignore-gpu-blocklist'] });

async function open(query) {
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.goto(base + query, { waitUntil: 'load' });
  // The app now opens on the start screen, so the hint only exists after Start captures the mouse.
  await page.waitForFunction(
    () => window.__marswalk && (document.querySelector('.hint') || document.querySelector('dialog[open].start-dialog .ui-button.primary')),
    { timeout: 180000 },
  );
  if (!(await page.evaluate(() => !!document.querySelector('.hint')))) {
    await page.click('dialog[open].start-dialog .ui-button.primary');
    try {
      await page.waitForFunction(() => document.querySelector('.hint'), { timeout: 15000 });
    } catch {
      throw new Error('The start screen did not close. Pointer lock may be unavailable in this automated browser session.');
    }
  }
  await page.bringToFront();
  return page;
}

const rows = [];
let machine = null;
try {
  for (const tier of ['high', 'low']) {
    const page = await open('?tier=' + tier);
    if (!machine) machine = await page.evaluate(() => ({ gpu: window.__marswalk.stats().gpu, viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent }));
    for (const [name, setup] of CASES) {
      await page.evaluate(setup);
      await wait(WARMUP);
      const r = await page.evaluate(SAMPLE, SECONDS);
      const s = await page.evaluate(() => window.__marswalk.stats());
      rows.push({ tier, name, ...r, tris: s.triangles, calls: s.drawCalls });
      console.log(`${tier.padEnd(4)}  ${name.padEnd(26)} ${String(r.fps).padStart(3)} fps  (1% low ${r.low1})  ${Math.round(s.triangles / 1000)}k tris, ${s.drawCalls} calls`);
    }
  }
  // automatic choice: what the app picks with no parameter, and whether it downgrades within 12 s
  const page = await open('');
  const first = await page.evaluate(() => window.__marswalk.stats());
  await wait(12);
  const later = await page.evaluate(() => window.__marswalk.stats());
  const browserName = /Edg\//.test(machine.ua) ? 'Edge ' + machine.ua.match(/Edg\/([\d.]+)/)[1] : 'Chrome ' + (machine.ua.match(/Chrome\/([\d.]+)/) || [])[1];
  console.log('\nGPU: ' + machine.gpu);
  console.log(`Browser: ${browserName}, window ${machine.viewport} CSS px at pixel ratio ${machine.dpr}`);
  console.log(`Automatic choice: starts on ${first.tier}, ${later.tier === first.tier ? 'stays on ' + later.tier : 'switches to ' + later.tier} after 12 s (${later.fps} fps)`);
  console.log('\n| Tier | Situation | fps | 1 % low |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.tier === 'high' ? 'High' : 'Low'} | ${r.name} | ${r.fps} | ${r.low1} |`);
} finally {
  await browser.close();
  await server.close();
}
