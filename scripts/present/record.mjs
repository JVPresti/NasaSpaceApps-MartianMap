// Record the presentation (#291) frame by frame and encode a smooth mp4.
//
//   npm run dev -- --port 5181                      # or npm run build && npm run preview
//   QA_GPU=1 node scripts/present/record.mjs        # full presentation, 1920 x 1080, 60 fps, English
//   QA_GPU=1 node scripts/present/record.mjs --seq global30 --out present-global30.mp4
//   QA_GPU=1 node scripts/present/record.mjs --lang es --size 1366x768
//   QA_GPU=1 node scripts/present/record.mjs --filmstrip 30 --beat zone   # every 30th frame as a contact sheet
//   QA_GPU=1 node scripts/present/record.mjs --measure [--tier low]        # live autoplay, frame rate per beat
//
// The page runs with ?present=1&record=1: every step advances exactly 1/60 s, and this script saves one frame per step,
// so the video is smooth whatever the capture speed. Frames go straight into an ffmpeg with libx264 (FFMPEG, the system
// ffmpeg, or ~/.cache/marswalk-ffmpeg from the imageio-ffmpeg wheel), never to disk, unless --frames <dir> asks for them.
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
const MEASURE = args.includes('--measure');

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

/** An ffmpeg with libx264: FFMPEG, the system ffmpeg, or the static build in the imageio-ffmpeg wheel. Playwright's own copy only has VP8. */
function ffmpegPath() {
  const hasX264 = (bin) => { const r = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' }); return r.status === 0 && /libx264/.test(r.stdout); };
  const candidates = [process.env.FFMPEG, 'ffmpeg'];
  for (const dir of [join(homedir(), '.cache/marswalk-ffmpeg/imageio_ffmpeg/binaries')]) {
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.startsWith('ffmpeg-')) candidates.push(join(dir, f));
  }
  for (const bin of candidates.filter(Boolean)) if (hasX264(bin)) return bin;
  throw new Error('No ffmpeg with libx264. Set FFMPEG, install ffmpeg, or run: uv pip install --target ~/.cache/marswalk-ffmpeg imageio-ffmpeg');
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

const SPLIT = opt('split', '');   // record in two browser sessions, the second starting at this beat, and join them

async function withPage(fn) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}

async function measure(page) {
  // Live: real time, the page's own loop. Count frames per beat with requestAnimationFrame.
  const mq = new URLSearchParams({ present: '1', autoplay: '1', seq: SEQ, lang: LANG });
  if (TIER) mq.set('tier', TIER);
  await page.goto(URL_BASE + '?' + mq, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.pr-progress', { timeout: 120000 });
  const result = await page.evaluate(() => new Promise((resolve) => {
    const per = {}; let last = performance.now(), worst = {};
    const beatNow = () => [...document.querySelectorAll('.pr-progress span')].findIndex((e) => e.className === 'on');
    const stopAt = performance.now() + 200000;
    function tick(now) {
      const b = beatNow(), dt = now - last; last = now;
      (per[b] ||= []).push(dt); worst[b] = Math.max(worst[b] || 0, dt);
      const spans = document.querySelectorAll('.pr-progress span:not(.pr-lang)');
      if (now > stopAt || (b === spans.length - 1 && per[b].length > 400)) {
        resolve(Object.entries(per).map(([k, v]) => ({ beat: Number(k), fps: Math.round(1000 * v.length / v.reduce((a, x) => a + x, 0)), worstMs: Math.round(worst[k]), frames: v.length })));
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  console.table(result);
}

/** Record from beat `from` ('' for the start) until beat `stopAt` begins ('' for the end) into `out`. */
async function recordRange(page, { from, stopAt, out }) {
  const q = new URLSearchParams({ present: '1', record: '1', autoplay: '1', seq: SEQ, lang: LANG });
  if (from) q.set('beat', from);
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
  const limit = MAX_FRAMES || total;
  console.log(`recording ${SEQ}, ${total} frames (${(total / 60).toFixed(1)} s) at ${W}x${H}`);

  const cdp = await page.createCDPSession();
  const shoot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true })).data, 'base64');

  let ff = null;
  if (!FILMSTRIP) {
    mkdirSync(dirname(out), { recursive: true });
    ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-color_range', 'tv', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  const stripDir = FILMSTRIP ? resolve(opt('strip-dir', 'present-filmstrip')) : null;
  if (stripDir) mkdirSync(stripDir, { recursive: true });
  if (FRAMES_DIR) mkdirSync(FRAMES_DIR, { recursive: true });
  const captions = [];
  let lastBeat = null;
  const t0 = Date.now();
  for (let f = 0; f < limit; f++) {
    const s = await page.evaluate(() => window.__present.step());
    if (stopAt && s.beat === stopAt) break;   // the next segment starts here, in a fresh browser
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
    console.log('wrote', out);
  }
  writeFileSync(out.replace(/\.mp4$/, '.beats.json'), JSON.stringify({ seq: SEQ, lang: LANG, fps: 60, beats: captions }, null, 2) + '\n');
  if (FILMSTRIP) console.log('frames in', stripDir);
}

if (MEASURE) {
  await withPage(measure);
} else if (SPLIT && !FILMSTRIP) {
  // A long capture can lose the browser (seen at about 4,000 frames on WSLg), so long videos record in two sessions.
  const parts = [OUT.replace(/\.mp4$/, '.part1.mp4'), OUT.replace(/\.mp4$/, '.part2.mp4')];
  await withPage((page) => recordRange(page, { from: BEAT, stopAt: SPLIT, out: parts[0] }));
  await withPage((page) => recordRange(page, { from: SPLIT, stopAt: '', out: parts[1] }));
  const list = OUT.replace(/\.mp4$/, '.parts.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  const r = spawnSync(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg concat failed');
  console.log('joined', OUT);
} else {
  await withPage((page) => recordRange(page, { from: BEAT, stopAt: '', out: OUT }));
}
