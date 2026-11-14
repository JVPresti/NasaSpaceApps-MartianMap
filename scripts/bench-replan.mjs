// On-demand benchmark for the emergency re-plan target from #23 and #127.
//
//   npm run bench
//
// It loads the real terrain, warms up each position, takes the best of five
// runs and fails if any position misses 100 ms. This is deliberately outside
// `npm test`: Vitest workers share a CPU and wall-clock assertions there are
// flaky.
import { readFileSync } from 'node:fs';

const TERRAIN = 'public/marswalk/assets/terrain.json';
const ROUTE = 'public/marswalk/assets/route.json';
const LIMIT_MS = 100;

const { buildCostGrid } = await import(new URL('../src/sim/costGrid.js', import.meta.url).href);
const { habitatFromRoute, replanToNearestShelter } = await import(new URL('../src/sim/replan.js', import.meta.url).href);

const terrain = JSON.parse(readFileSync(TERRAIN, 'utf8'));
const route = JSON.parse(readFileSync(ROUTE, 'utf8'));
const grid = buildCostGrid(terrain);
const habitat = habitatFromRoute(route);

const positions = [
  [0, 0, 'Cheyava Falls'],
  [300, -200, 'channel floor'],
  [-400, 400, 'south-west'],
  [-300, -300, 'north-west'],
  [520, 600, 'at the habitat'],
];

let failed = false;
console.log('Re-plan benchmark, HAB as the only shelter (limit ' + LIMIT_MS + ' ms)');

for (const [x, z, label] of positions) {
  replanToNearestShelter(grid, { x, z }, [habitat]);
  let best = Infinity;
  let result = null;
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    result = replanToNearestShelter(grid, { x, z }, [habitat]);
    best = Math.min(best, performance.now() - started);
  }
  const ok = result.ok && best < LIMIT_MS;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(14)} (${String(x).padStart(4)}, ${String(z).padStart(4)}) ` +
    `${best.toFixed(1).padStart(6)} ms · ${result.distance.toFixed(1)} m`,
  );
}

if (failed) {
  console.error('At least one position missed the ' + LIMIT_MS + ' ms target.');
  process.exitCode = 1;
}
