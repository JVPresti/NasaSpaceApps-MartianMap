// Renders the architecture diagram to img/architecture.png and report.html to Marswalk-Report.pdf.
//
//   node docs/report/tools/render.mjs arch      # tools/architecture.html -> img/architecture.png
//   node docs/report/tools/render.mjs pdf       # report.html -> Marswalk-Report.pdf
//
// Needs puppeteer-core (a repo devDependency) and a Chromium: CHROME_PATH, or the Playwright cache. Printing needs no
// GPU, so headless is fine here. build.py stamps the page footers afterwards (the cover gets none).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const report = dirname(here);

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      const bin = join(cache, dir, 'chrome-linux64', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe']) {
    if (existsSync(p)) return p;
  }
  throw new Error('No Chromium found. Set CHROME_PATH.');
}

const what = process.argv[2] ?? 'pdf';
const browser = await puppeteer.launch({ executablePath: chrome(), headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();

if (what === 'arch') {
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(join(here, 'architecture.html')).href, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 1600, height: h, deviceScaleFactor: 2 });
  await page.screenshot({ path: join(report, 'img', 'architecture.png'), fullPage: true });
  console.log('wrote img/architecture.png');
} else {
  await page.goto(pathToFileURL(join(report, 'report.html')).href, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluateHandle('document.fonts.ready');
  await page.pdf({
    path: join(report, 'Marswalk-Report.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  console.log('wrote Marswalk-Report.pdf');
}
await browser.close();
