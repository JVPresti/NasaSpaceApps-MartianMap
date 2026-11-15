// Copies the presenter lines and times from script-5min-en.md (the primary local pitch) into the 5-minute table of beats.md, so the
// presentation thread never reads a stale line. Not part of the app build.
//
//   node docs/pitch/tools/sync-beats.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP = { '1a': '1 · Jezero', '1b': '1 · Thesis', 2: '2 · The limits', 3: '3 · The walkback zone', 4: '4 · Demo',
  5: '5 · The answer and the data', 6: '6 · Measured or simulated', 7: '7 · Who, and one fact' };

const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const script = readFileSync(join(ROOT, 'script-5min-en.md'), 'utf8').split('\n');
const start = script.findIndex((l) => l.startsWith('| Time | Beat |'));
const rows = [];
for (let i = start + 2; i < script.length && script[i].startsWith('|'); i++) {
  const [time, beat, , text] = cells(script[i]);
  rows.push({ time, beat, text: text.replace(/\([^)]*\)\s*/g, '').trim() });
}
const byBeat = Object.fromEntries(rows.map((r, i) => [r.beat, { ...r, end: rows[i + 1]?.time }]));

const beats = readFileSync(join(ROOT, 'beats.md'), 'utf8').split('\n');
const t5 = beats.findIndex((l) => l.startsWith('## 5-minute pitch'));
const t0 = beats.findIndex((l, i) => i > t5 && l.startsWith('| # | Time | Beat |'));
let changed = 0;
for (let i = t0 + 2; i < beats.length && beats[i].startsWith('|'); i++) {
  const c = cells(beats[i]);
  const src = byBeat[MAP[c[0]]];
  if (!src) continue;
  c[1] = `${src.time}-${src.end}`;
  if (c[0] !== '4') c[5] = `"${src.text}"`;
  beats[i] = `| ${c.join(' | ')} |`;
  changed++;
}
const slack = rows[rows.length - 1].time;
const out = beats.join('\n').replace(/^\d+ seconds of slack after beat 7 \([^)]*to 5:00\)\./m, () => {
  const [m, s] = slack.split(':').map(Number);
  return `${300 - (m * 60 + s)} seconds of slack after beat 7 (${slack} to 5:00).`;
});
writeFileSync(join(ROOT, 'beats.md'), out);
console.log(`synced ${changed} beats from script-5min-en.md`);
