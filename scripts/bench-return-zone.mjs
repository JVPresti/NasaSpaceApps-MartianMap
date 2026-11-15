// On-demand benchmark for the return zone (src/sim/returnZone.js, #309) on the real HiRISE tile.
//
//   node scripts/bench-return-zone.mjs > docs/qa/return-zone/bench-node.txt
//
// It runs the first sortie's moments from src/sim/returnZone.test.js, warms each case up once, and prints the area,
// reach, limit and the time of 3 runs. It also times the whole tile on the grid's own spacing (step 1) against the
// 4 m cells the app uses (step 2). Outside `npm test` because wall-clock numbers there are flaky.
import { readFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { buildCostGrid } = await import('../src/sim/costGrid.js');
const { computeReturnZone, shelterWindowSec } = await import('../src/sim/returnZone.js');
const { suitConstantsFromHazards } = await import('../src/sim/suitModel.js');
const { DEFAULT_NEEDS, OBJECTIVE_DEFAULTS, RISK_SETTINGS } = await import('../src/sim/missionNeeds.js');
const { FIRST_OBJECTIVE, FIRST_STOP, missionEventDefinitions } = await import('../src/sim/missions.js');
const radiation = load('../src/sim/events/radiation.json');

const c = suitConstantsFromHazards(load('../public/data/hazards.json'));
const grid = buildCostGrid(load('../public/marswalk/assets/terrain.json'));
const home = load('../public/data/shelters.json').shelters.find((s) => s.id === 'HAB');
const stop = load('../public/data/stops.json').route_stops.find((s) => s.id === FIRST_STOP);
const risk = RISK_SETTINGS[DEFAULT_NEEDS.risk];
const usableSec = OBJECTIVE_DEFAULTS.sortie.timeMin * 60 * (1 - risk.reserveShare);
const plan = { marginFloor: risk.marginFloor, marginFloorSec: c.warningSec, batteryReserveWh: risk.reserveShare * c.batteryWh, stops: [{ x: stop.x, z: stop.z, workSec: stop.work_time_s.value ?? stop.work_time_s }] };
const windowSec = shelterWindowSec(missionEventDefinitions(FIRST_OBJECTIVE, [radiation]).find((d) => d.id === 'radiation'));
const atStop = { grid, home, from: { x: stop.x, z: stop.z }, suit: { o2G: c.o2UsableG - 10, batteryWh: c.batteryWh - 5, elapsedSec: 150 }, constants: c, evaLimitSec: usableSec, plan: { ...plan, stops: [] } };
const full = { grid, home, suit: { o2G: c.o2UsableG, batteryWh: c.batteryWh }, constants: c, evaLimitSec: c.evaMaxSec };

const cases = [
  ['Suit limits only, 4 m cells', full],
  ['Suit limits only, grid spacing (step 1)', { ...full, step: 1 }],
  ['Plan before Begin EVA', { grid, home, suit: full.suit, constants: c, evaLimitSec: usableSec, plan }],
  ['At the stop, T+150 s', atStop],
  ['Dust storm at the stop', { ...atStop, modifiers: { homeward: true } }],
  [`Radiation alert at the stop, ${windowSec} s window`, { ...atStop, modifiers: { homeward: true, shelterWithinSec: windowSec } }],
  ['Radiation alert, full EVA 210 s window', { ...atStop, modifiers: { homeward: true, shelterWithinSec: 210 } }],
];

console.log(`node ${process.version} · ${cpus()[0].model} · load ${loadavg().map((l) => l.toFixed(1)).join(' ')} · ${new Date().toISOString()}`);
console.log(`tile ${grid.width.toFixed(0)} m x ${grid.depth.toFixed(0)} m (${(grid.width * grid.depth / 1e6).toFixed(2)} km²) · usable plan time ${usableSec} s · radiation window ${windowSec} s`);
console.log('case | area km² | reach m | limit | ms (3 runs)');
for (const [name, input] of cases) {
  computeReturnZone(input);   // warm-up
  const runs = [], now = () => performance.now();
  let z;
  for (let i = 0; i < 3; i += 1) { z = computeReturnZone({ ...input, now }); runs.push(z.stats.ms); }
  const area = (z.stats.insideM2 + z.stats.edgeM2) / 1e6;
  console.log(`${name} | ${area.toFixed(3)} | ${Math.round(z.stats.reachM)} | ${z.stats.limit ?? '-'} | ${runs.map((m) => m.toFixed(0)).join(', ')}`);
}
