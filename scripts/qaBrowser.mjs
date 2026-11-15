// Browser launch for the QA scripts (puppeteer-core). Default: headless Chrome with SwiftShader, software WebGL that
// works anywhere (CI, other machines) and is slow. QA_GPU=1: a headed Chromium on the WSLg X server that renders on the
// GPU through Mesa's d3d12 driver; the window sits off screen. With QA_GPU=1 the launch fails loudly when the renderer
// is still SwiftShader.
//
//   CHROME     browser binary (QA_GPU=1 needs full Chromium, not chrome-headless-shell)
//   QA_GPU=1   GPU recipe; DISPLAY defaults to :0 and GALLIUM_DRIVER to d3d12
import puppeteer from 'puppeteer-core';

export const GPU = process.env.QA_GPU === '1';

const COMMON = [
  '--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
];

/** Launches one browser. `viewport` is { width, height }. */
export async function launchBrowser({ executablePath = process.env.CHROME, viewport = { width: 1366, height: 768 }, protocolTimeout = 600_000 } = {}) {
  if (!executablePath) throw new Error('set CHROME to a Chrome or Chromium binary');
  if (!GPU) {
    return puppeteer.launch({
      executablePath, headless: true, protocolTimeout, defaultViewport: viewport,
      args: [...COMMON, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${viewport.width},${viewport.height}`],
    });
  }
  process.env.GALLIUM_DRIVER ||= 'd3d12';
  process.env.DISPLAY ||= ':0';
  return puppeteer.launch({
    executablePath, headless: false, protocolTimeout, defaultViewport: viewport,
    args: [
      ...COMMON, '--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist',
      '--window-position=-4000,-4000', `--window-size=${viewport.width},${viewport.height + 132}`,
    ],
  });
}

/** The WebGL renderer string of a page. */
export function rendererOf(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
}

/** With QA_GPU=1, throws when the page renders on SwiftShader. Returns the renderer string. */
export async function checkRenderer(page) {
  const renderer = await rendererOf(page);
  if (GPU && /swiftshader/i.test(renderer)) throw new Error('QA_GPU=1 but the renderer is ' + renderer);
  return renderer;
}
