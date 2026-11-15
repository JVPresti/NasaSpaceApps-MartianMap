// Chromium for the browser QA scripts (room-e2e-browser.mjs, room-e2e-habitat.mjs), through puppeteer-core.
//
// Default: headless Chromium on SwiftShader (software WebGL), which works on CI and any machine. Set CHROME to the
// binary. On a WSL2 machine with WSLg and a GPU, QA_GPU=1 starts a headed Chromium on the WSLg X server instead, off
// screen, rendering through Mesa's d3d12 driver. CHROME then points at a full Chromium (not chrome-headless-shell);
// without it the script looks for Playwright's chromium-1247 in ~/.cache/ms-playwright. The GPU run fails loudly if
// WebGL still reports SwiftShader.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

export const QA_GPU = process.env.QA_GPU === '1';

const THROTTLE_OFF = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

/** @param {{ width?: number, height?: number }} [size] viewport */
export async function launchBrowser({ width = 1280, height = 800 } = {}) {
  if (!QA_GPU) {
    return puppeteer.launch({
      executablePath: process.env.CHROME,
      headless: true,
      protocolTimeout: 600000,
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...THROTTLE_OFF, `--window-size=${width},${height}`],
      defaultViewport: { width, height },
    });
  }
  process.env.GALLIUM_DRIVER ||= 'd3d12';   // Chrome inherits the environment
  process.env.DISPLAY ||= ':0';
  const fallback = (process.env.HOME || '') + '/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome';
  const executablePath = process.env.CHROME || fallback;
  if (!existsSync(executablePath)) throw new Error('QA_GPU=1: set CHROME to a full Chromium binary (looked for ' + executablePath + ')');
  return puppeteer.launch({
    executablePath,
    headless: false,
    protocolTimeout: 600000,
    defaultViewport: { width, height },
    args: [
      '--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist',
      '--window-position=-4000,-4000', `--window-size=${width},${height + 132}`,
      ...THROTTLE_OFF, '--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

/** The WebGL renderer string of a page. With QA_GPU=1 it throws when the page still renders on SwiftShader. */
export async function checkRenderer(page) {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'no WebGL2';
  });
  if (QA_GPU && /swiftshader|llvmpipe|no WebGL2/i.test(renderer)) throw new Error('QA_GPU=1 but WebGL renders on ' + renderer);
  return renderer;
}
