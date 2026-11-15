// Phone and tablet QA helpers (#365): open the app at a phone size with touch emulation, check for horizontal scroll and
// small touch targets, and save screenshots. Import it from a driver script, or run it for a quick check of one URL:
//
//   node scripts/qa-mobile.mjs http://localhost:5173/ --out ~/.cache/marswalk-mobile/shots
//
// CHROME sets the browser executable; without it the newest Playwright Chromium in ~/.cache/ms-playwright is used.
// The browser is headless by default and renders with SwiftShader, which is slow but works on any machine.
// QA_GPU=1 runs a headed Chrome off screen instead, for a machine with a display and a GPU. On WSL2 the X server is WSLg
// and Mesa needs its d3d12 driver: set QA_GALLIUM=d3d12 (on Linux with a native GPU, leave it unset).
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

/** The sizes the mobile checks run at, CSS px. */
export const VIEWPORTS = {
  se: { width: 375, height: 667 },
  iphone: { width: 390, height: 844 },
  android: { width: 360, height: 800 },
  pixel: { width: 412, height: 915 },
  landscape: { width: 844, height: 390 },
  tablet: { width: 768, height: 1024 },
};

/** Smallest touch target the checks accept, CSS px (WCAG 2.5.5). */
export const MIN_TARGET_PX = 44;

export async function launch() {
  const gpu = process.env.QA_GPU === '1';
  if (gpu) {
    if (process.env.QA_GALLIUM) process.env.GALLIUM_DRIVER = process.env.QA_GALLIUM;
    process.env.DISPLAY ||= ':0';
  }
  const executablePath = process.env.CHROME || playwrightChromium();
  if (!executablePath) throw new Error('No browser: set CHROME to a Chrome or Chromium executable');
  const args = ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (gpu) args.push('--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist',
    '--window-position=-4000,-4000', '--window-size=1366,1100');
  return puppeteer.launch({ executablePath, headless: !gpu, defaultViewport: null, args, protocolTimeout: 240_000 });
}

/** The newest full Chromium that Playwright installed, or null. */
function playwrightChromium() {
  const root = join(process.env.HOME || '', '.cache/ms-playwright');
  if (!existsSync(root)) return null;
  const builds = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const d of builds) {
    const exe = join(root, d, 'chrome-linux64', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** Sets a phone viewport with touch emulation on an open page (CDP, so `pointer: coarse` matches). */
export async function phone(page, size, { dpr = 2, mobile = true } = {}) {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: size.width, height: size.height, deviceScaleFactor: dpr, mobile,
    screenOrientation: size.width > size.height
      ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  return cdp;
}

/** The renderer string, so a run can fail loudly when it is not on the GPU. */
export async function renderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
}

/**
 * Horizontal scroll and visible controls under MIN_TARGET_PX on either side. Inline links inside running text are
 * left out (WCAG 2.5.8 exempts them); every button, input, select and standalone link counts.
 */
export async function audit(page) {
  return page.evaluate((min) => {
    const doc = document.scrollingElement || document.documentElement;
    const overflowX = doc.scrollWidth - window.innerWidth;
    const small = [];
    for (const el of document.querySelectorAll('button, [role="button"], input, select, textarea, a[href], summary')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('[hidden], [aria-hidden="true"], dialog:not([open])')) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
      if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && /^(P|LI|SPAN|SMALL)$/.test(el.parentElement.tagName)) continue;
      // a checkbox or radio inside its label: the label is the target
      if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
        const l = el.closest('label').getBoundingClientRect();
        if (l.width >= min && l.height >= min) continue;
      }
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.')} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { overflowX, small };
  }, MIN_TARGET_PX);
}

/** Saves a PNG screenshot of the viewport and returns its path. */
export async function shot(page, dir, name) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name + '.png');
  await page.screenshot({ path });
  return path;
}

/** Mean frames per second over `ms`, from requestAnimationFrame. */
export async function fps(page, ms = 3000) {
  return page.evaluate((ms) => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const tick = (t) => { n += 1; if (t - t0 < ms) requestAnimationFrame(tick); else resolve(Math.round((n * 1000) / (t - t0))); };
    requestAnimationFrame(tick);
  }), ms);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2] || 'http://localhost:5173/';
  const oi = process.argv.indexOf('--out');
  const out = oi > 0 ? process.argv[oi + 1] : join(process.env.HOME || process.env.USERPROFILE || '.', '.cache/marswalk-mobile/shots');
  const browser = await launch();
  try {
    for (const [name, size] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage();
      await phone(page, size);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 4000));
      const a = await audit(page);
      console.log(name, `${size.width}x${size.height}`, 'overflowX', a.overflowX, 'small', a.small.length, a.small.slice(0, 8));
      console.log('  ', await shot(page, out, `quick-${name}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
