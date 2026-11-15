// Builds the self-contained decks and renders them to PNG and PDF. Not part of the app build.
//
//   node docs/pitch/tools/render.mjs [deck ...]     (default: every file in docs/pitch/src/*.html)
//
// 1. Reads docs/pitch/src/<deck>.html, which links fonts and images by relative path.
// 2. Inlines every url(...) and src="..." that points at a local file as a data: URI and writes
//    docs/pitch/<deck>.html, one file with no network requests.
// 3. Opens that file in headless Chromium at 1920x1080, saves one PNG per <section class="slide"> in
//    docs/pitch/out/<deck>/NN.png and a 16:9 PDF in docs/pitch/out/<deck>.pdf.
// Needs puppeteer-core (a repo devDependency) and a Chromium: CHROME_PATH or the Playwright cache.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const MIME = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  for (const d of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = join(cache, d, 'chrome-linux64/chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('No Chromium found. Set CHROME_PATH.');
}

function inline(html, base) {
  const toData = (ref) => {
    if (/^(data:|https?:|#)/.test(ref)) return ref;
    const file = resolve(base, ref);
    const type = MIME[extname(file).toLowerCase()];
    if (!type || !existsSync(file)) throw new Error(`Missing or unknown asset: ${ref}`);
    return `data:${type};base64,${readFileSync(file).toString('base64')}`;
  };
  return html
    .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, ref) => `<style>\n${readFileSync(resolve(base, ref), 'utf8')}\n</style>`)
    .replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, ref) => `url("${toData(ref)}")`)
    .replace(/(src|href)="([^"]+\.(?:png|jpe?g|webp|svg|woff2))"/g, (_, attr, ref) => `${attr}="${toData(ref)}"`);
}

const decks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SRC).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

const browser = await puppeteer.launch({ executablePath: chrome(), headless: 'new', args: ['--window-size=1920,1080'] });
for (const deck of decks) {
  const html = inline(readFileSync(join(SRC, `${deck}.html`), 'utf8'), SRC);
  const outHtml = join(ROOT, `${deck}.html`);
  writeFileSync(outHtml, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(pathToFileURL(outHtml).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const dir = join(ROOT, 'out', deck);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const slides = await page.$$('section.slide');
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}.png`) });
  }
  await page.pdf({ path: join(ROOT, 'out', `${deck}.pdf`), width: '1920px', height: '1080px', printBackground: true, pageRanges: '' });
  console.log(`${deck}: ${slides.length} slides`);
  await page.close();
}
await browser.close();
