// Renders one preview image per Plan-mode data layer (#51), from the engine itself, so a preview always matches what
// the layer looks like in the app.
//
//   npm run previews
//   npm run previews -- --browser "C:/path/to/chrome.exe"
//
// Starts the Vite dev server (the store hook window.__missionStore only exists in development), opens the app with
// ?mock=1 in a browser window of exactly WIDTH x HEIGHT, hides every overlay (HUD, Plan chrome, the position marker's
// canvas) and clears the waypoints and the route, and for each layer of src/plan/layers.js shows Plan mode's top-down
// camera with a clear-day sky and no dust, then saves the view as WebP into
// public/marswalk/previews/<layer id>.webp. Every image has the same size and framing and must stay under MAX_BYTES.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { LAYERS } from '../src/plan/layers.js';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, PREVIEW_DIR, PREVIEW_MAX_BYTES } from '../src/plan/layerPreviews.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', PREVIEW_DIR);
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({
  executablePath: browserPath, headless: false,   // a real window: WebGL 2 on the GPU, like the app
  defaultViewport: { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, deviceScaleFactor: 1 },
  args: ['--window-size=' + (PREVIEW_WIDTH + 40) + ',' + (PREVIEW_HEIGHT + 160), '--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.goto(url + '?mock=1&tier=high', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__missionStore && window.__marswalk && document.querySelector('canvas'), { timeout: 120000 });
  await wait(4000);   // textures, rocks and the first frames
  // only the engine's own canvas: every overlay, including the 2D canvas of the position marker, is hidden
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } .engine-view > canvas { visibility: visible !important; }' });
  await page.evaluate(() => {
    window.__missionStore.setState((s) => ({
      mode: 'plan',
      view: { ...s.view, sky: 'clear_day', skyBlend: 0, layer: 0 },
      environment: { ...s.environment, dustOpacity: 0.45 },
      route: { ...s.route, path: null, shelter: null },
    }));
  });
  await wait(4000);   // preset shadows and the camera move into Plan mode; Plan mode loads route.json's waypoints
  await page.evaluate(() => window.__missionStore.setState((s) => ({ route: { ...s.route, waypoints: [], path: null, shelter: null } })));
  await wait(1500);
  mkdirSync(outDir, { recursive: true });

  for (const layer of LAYERS) {
    await page.evaluate((index) => window.__missionStore.setState((s) => ({ view: { ...s.view, layer: index } })), layer.index);
    await wait(800);
    // Plan mode puts the waypoints and the route back when the layer changes: clear them again for every image
    await page.evaluate(() => window.__missionStore.setState((s) => ({ route: { ...s.route, waypoints: [], path: null, shelter: null } })));
    await wait(1200);
    let quality = 80, image;
    do {
      image = await page.screenshot({ type: 'webp', quality, clip: { x: 0, y: 0, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT } });
      quality -= 8;
    } while (image.length > PREVIEW_MAX_BYTES && quality > 30);
    if (image.length > PREVIEW_MAX_BYTES) throw new Error(`${layer.id}: ${image.length} bytes, over ${PREVIEW_MAX_BYTES}`);
    writeFileSync(join(outDir, layer.id + '.webp'), image);
    console.log(`${layer.id.padEnd(10)} ${(image.length / 1024).toFixed(1)} KB (quality ${quality + 8})`);
  }
  console.log(`Wrote ${LAYERS.length} previews of ${PREVIEW_WIDTH} x ${PREVIEW_HEIGHT} px to public/${PREVIEW_DIR}/`);
} finally {
  await browser.close();
  await server.close();
}
