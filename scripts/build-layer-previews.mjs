// Renders one preview image per map layer (#51) with the mission table's own map painter (src/plan/mapLayers.js
// paintMap), so a preview always matches what the layer looks like on the table, where the previews pop up beside the
// layer buttons. Radio shadow and Exposure are drawn on the table only, so the 3D engine cannot show them.
//
//   npm run previews
//   npm run previews -- --browser "C:/path/to/chrome.exe"
//
// Starts the Vite dev server and opens the app in a headless browser, so the page can import the app's own modules
// and data. It waits for the engine to place the habitat, to take the mast where engine.getHabitatMast() puts it
// (src/engine/index.js), then for each layer of src/plan/layers.js paints the same 1000 x 625 m view of the full EVA
// route, at the standard risk setting, crops it to PREVIEW_WIDTH x PREVIEW_HEIGHT and saves it as WebP into
// public/marswalk/previews/<layer id>.webp, under MAX_BYTES. A preview of a layer that is gone is deleted.
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

/**
 * The square painted for every preview, of which the middle PREVIEW_HEIGHT rows are kept: 1000 x 625 m around the full
 * EVA route (habitat airlock at x 535 z 574, Cheyava Falls at 0 0), its east edge on the tile's (x 711).
 */
const CROP = { x0: 711 - 1000, z0: 287 - 500, size: 1000 };

const server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
// layers.js imports the language catalogs as JSON, which plain Node cannot, so the list comes through Vite too
const { PREVIEW_DIR, PREVIEW_HEIGHT, PREVIEW_MAX_BYTES, PREVIEW_WIDTH } = await server.ssrLoadModule('/src/plan/layerPreviews.js');
const { LAYERS } = await server.ssrLoadModule('/src/plan/layers.js');
const outDir = join(root, 'public', PREVIEW_DIR);
const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });
  // the habitat is placed once the engine has loaded; the mast is fixed on it (engine.getHabitatMast)
  await page.waitForFunction(() => { try { return Number.isFinite(window.__marswalk?.habitat?.().x); } catch { return false; } }, { timeout: 240000 });
  const mast = await page.evaluate(() => {
    const h = window.__marswalk.habitat(), y = window.__marswalk.habitatY();
    // model +X is the airlock end; rotation.y = atan2(-dir.z, dir.x), so local (x, z) turns to (x dirX - z dirZ, x dirZ + z dirX)
    const lx = -1.9, ly = 4.35, lz = 3.4;
    return { x: h.x + lx * h.dirX - lz * h.dirZ, y: y + ly, z: h.z + lx * h.dirZ + lz * h.dirX };
  });
  console.log(`habitat mast at (${mast.x.toFixed(1)}, ${mast.y.toFixed(1)}, ${mast.z.toFixed(1)})`);

  mkdirSync(outDir, { recursive: true });
  for (const layer of LAYERS) {
    const image = await page.evaluate(async ({ index, id, crop, mast, width, height, maxBytes }) => {
      const { paintMap, slopeGrid } = await import('/src/plan/mapLayers.js');
      const { decodeTerrain } = await import('/src/sim/costGrid.js');
      const { radioShadowMask } = await import('/src/sim/radio.js');
      const { decodeSkyViewGrid } = await import('/src/sim/skyView.js');
      const pixels = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          resolve({ w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data });
        };
        img.onerror = () => reject(new Error(src + ' did not load'));
        img.src = src;
      });
      window.__previewData ??= (async () => {
        const terrain = decodeTerrain(await (await fetch('/marswalk/assets/terrain.json')).json());
        return {
          ortho: await pixels('/marswalk/assets/ortho_lo.jpg'),
          mask: await pixels('/marswalk/assets/outcrop_mask.jpg'),
          terrain,
          slopes: slopeGrid(terrain),
          radio: radioShadowMask(terrain, mast),
          sky: decodeSkyViewGrid(await (await fetch('/data/sky_view.json')).json()),
        };
      })();
      const data = await window.__previewData;
      const square = document.createElement('canvas'); square.width = width; square.height = width;
      const g = square.getContext('2d');
      const out = g.createImageData(width, width);
      paintMap(out.data, width, crop, index, data);
      g.putImageData(out, 0, 0);
      if (id === 'zone') {
        // the first mission's plan zone from the habitat airlock: the default needs' budget (planFromNeeds) and the sortie
        // stop's work time
        const { buildCostGrid } = await import('/src/sim/costGrid.js');
        const { suitConstantsFromHazards } = await import('/src/sim/suitModel.js');
        const { computeReturnZone } = await import('/src/sim/returnZone.js');
        const { DEFAULT_NEEDS, OBJECTIVE_DEFAULTS, RISK_SETTINGS } = await import('/src/sim/missionNeeds.js');
        const { drawZoneWorld } = await import('/src/zone/zonePaint.js');
        const constants = suitConstantsFromHazards(await (await fetch('/data/hazards.json')).json());
        const hab = (await (await fetch('/data/shelters.json')).json()).shelters.find((s) => s.id === 'HAB');
        const sortie = (await (await fetch('/data/stops.json')).json()).route_stops.find((s) => s.id === 'sortie');
        const risk = RISK_SETTINGS[DEFAULT_NEEDS.risk];
        const zone = computeReturnZone({
          grid: buildCostGrid(data.terrain), home: hab, suit: { o2G: constants.o2UsableG, batteryWh: constants.batteryWh }, constants,
          evaLimitSec: OBJECTIVE_DEFAULTS.sortie.timeMin * 60 * (1 - risk.reserveShare),
          plan: { marginFloor: risk.marginFloor, batteryReserveWh: risk.reserveShare * constants.batteryWh, stops: [{ x: sortie.x, z: sortie.z, workSec: sortie.work_time_s.value }] },
        });
        const k = width / crop.size;
        g.setTransform(k, 0, 0, k, -crop.x0 * k, -crop.z0 * k);
        drawZoneWorld(g, zone);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      const frame = document.createElement('canvas'); frame.width = width; frame.height = height;
      frame.getContext('2d').drawImage(square, 0, (width - height) / 2, width, height, 0, 0, width, height);
      let quality = 0.8, dataUrl;
      do { dataUrl = frame.toDataURL('image/webp', quality); quality -= 0.08; } while (dataUrl.length * 0.75 > maxBytes && quality > 0.3);
      return dataUrl;
    }, { index: layer.index, id: layer.id, crop: CROP, mast, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, maxBytes: PREVIEW_MAX_BYTES });
    const bytes = Buffer.from(image.replace(/^data:image\/webp;base64,/, ''), 'base64');
    if (bytes.length > PREVIEW_MAX_BYTES) throw new Error(`${layer.id}: ${bytes.length} bytes, over ${PREVIEW_MAX_BYTES}`);
    writeFileSync(join(outDir, layer.id + '.webp'), bytes);
    console.log(`${layer.id.padEnd(10)} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  const ids = new Set(LAYERS.map((layer) => layer.id + '.webp'));
  for (const file of readdirSync(outDir).filter((f) => f.endsWith('.webp') && !ids.has(f))) {
    unlinkSync(join(outDir, file));
    console.log(`removed ${file}: no layer by that id`);
  }
  console.log(`Wrote ${LAYERS.length} previews of ${PREVIEW_WIDTH} x ${PREVIEW_HEIGHT} px to public/${PREVIEW_DIR}/`);
} finally {
  await browser.close();
  await server.close();
}
