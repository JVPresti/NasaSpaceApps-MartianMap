// Record the presentation (#291) frame by frame and encode a smooth mp4.
//
//   npm run dev -- --port 5181                      # or npm run build && npm run preview
//   QA_GPU=1 node scripts/present/record.mjs        # full presentation, 1920 x 1080, 60 fps, English
//   QA_GPU=1 node scripts/present/record.mjs --seq global30 --out present-global30.mp4
//   QA_GPU=1 node scripts/present/record.mjs --lang es --size 1366x768
//   QA_GPU=1 node scripts/present/record.mjs --filmstrip 30 --beat zone   # every 30th frame as a contact sheet
//
// The page runs with ?present=1&record=1: every step advances exactly 1/60 s, and this script saves one frame per step,
// so the video is smooth whatever the capture speed. Frames go straight into ffmpeg (system ffmpeg, or the one
// Playwright ships in ~/.cache/ms-playwright/ffmpeg-*), never to disk, unless --frames <dir> asks for them.
//
// GPU: headless Chrome in WSL2 falls back to SwiftShader (minutes per frame). QA_GPU=1 starts a headed Chrome off screen on
// the WSLg X server, which renders on the real GPU (Mesa d3d12). Without it the script uses headless Chrome and warns.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const URL_BASE = opt('url', 'http://localhost:5181/');
const SEQ = opt('seq', 'full');
const LANG = opt('lang', 'en');
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const OUT = resolve(opt('out', `present-${SEQ}-${LANG}-${W}x${H}.mp4`));
const FILMSTRIP = Number(opt('filmstrip', 0));
const BEAT = opt('beat', '');
const TIER = opt('tier', '');
const FRAMES_DIR = opt('frames', '');
const MAX_FRAMES = Number(opt('max-frames', 0));
const GPU = process.env.QA_GPU === '1';

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), '.cache/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache) : [];
  const full = dirs.filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()[0];
  const shell = dirs.filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
  if (GPU && full) return join(cache, full, 'chrome-linux64/chrome');
  if (shell) return join(cache, shell, 'chrome-headless-shell-linux64/chrome-headless-shell');
  if (full) return join(cache, full, 'chrome-linux64/chrome');
  throw new Error('No Chromium found: set CHROME=/path/to/chrome');
}

function ffmpegPath() {
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  const cache = join(homedir(), '.cache/ms-playwright');
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('ffmpeg-')).sort().reverse()[0] : null;
  if (dir) for (const name of ['ffmpeg-linux', 'ffmpeg']) { const p = join(cache, dir, name); if (existsSync(p)) return p; }
  throw new Error('No ffmpeg found: install ffmpeg or Playwright\'s copy');
}

async function launch() {
  if (GPU) {
    process.env.GALLIUM_DRIVER ||= 'd3d12';
    process.env.DISPLAY ||= ':0';
    return puppeteer.launch({
      executablePath: chromePath(), headless: false, defaultViewport: { width: W, height: H },
      args: ['--ozone-platform=x11', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist',
        '--window-position=-4000,-4000', `--window-size=${W},${H + 140}`,
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--no-sandbox', '--mute-audio', '--hide-scrollbars'],
    });
  }
  console.warn('QA_GPU is not set: headless Chrome renders on the CPU (SwiftShader) and is very slow.');
  return puppeteer.launch({ executablePath: chromePath(), headless: true, defaultViewport: { width: W, height: H }, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
}

const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const q = new URLSearchParams({ present: '1', record: '1', autoplay: '1', seq: SEQ, lang: LANG });
  if (BEAT) q.set('beat', BEAT);
  if (TIER) q.set('tier', TIER);
  await page.goto(URL_BASE + '?' + q, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL 2';
  });
  console.log('renderer:', renderer);
  if (GPU && /SwiftShader|llvmpipe/i.test(renderer)) throw new Error('QA_GPU=1 but Chrome renders on the CPU: ' + renderer);
  await page.waitForFunction(() => window.__present && window.__present.ready, { timeout: 240000, polling: 250 });
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.__present.total);
  const limit = MAX_FRAMES || total + 2;
  console.log(`recording ${SEQ}, ${total} frames (${(total / 60).toFixed(1)} s) at ${W}x${H}`);

  const cdp = await page.createCDPSession();
  const shoot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true })).data, 'base64');

  let ff = null;
  if (!FILMSTRIP) {
    mkdirSync(dirname(OUT), { recursive: true });
    ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  const stripDir = FILMSTRIP ? resolve(opt('strip-dir', 'present-filmstrip')) : null;
  if (stripDir) mkdirSync(stripDir, { recursive: true });
  if (FRAMES_DIR) mkdirSync(FRAMES_DIR, { recursive: true });
  const captions = [];
  let lastBeat = null;
  const t0 = Date.now();
  for (let f = 0; f < limit; f++) {
    const s = await page.evaluate(() => window.__present.step());
    if (s.beat !== lastBeat) { captions.push({ beat: s.beat, frame: f }); lastBeat = s.beat; }
    if (FILMSTRIP) {
      if (f % FILMSTRIP === 0) writeFileSync(join(stripDir, `f${String(f).padStart(5, '0')}.jpg`), await shoot());
    } else {
      const img = await shoot();
      if (FRAMES_DIR) writeFileSync(join(FRAMES_DIR, `f${String(f).padStart(5, '0')}.jpg`), img);
      if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 120 === 0) console.log(`frame ${f}/${total} ${s.beat} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (s.done) break;
  }
  if (ff) {
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('wrote', OUT);
  }
  writeFileSync(OUT.replace(/\.mp4$/, '.beats.json'), JSON.stringify({ seq: SEQ, lang: LANG, fps: 60, beats: captions }, null, 2) + '\n');
  if (FILMSTRIP) console.log('frames in', stripDir);
} finally {
  await browser.close();
}
