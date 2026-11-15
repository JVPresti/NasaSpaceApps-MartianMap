// Measures the 8-minute demo (#265, docs/DEMO.md) on this machine: drives the real first mission, start screen to
// sources, and prints each segment's budget against the time it took.
//
//   npm run measure:demo
//   npm run measure:demo -- --headed --lang es --viewport 1920x1080 --shots C:/tmp/demo-shots
//   npm run measure:demo -- --dwell-scale 0.2        (a quick player instead of a presenter)
//
// Starts the Vite dev server (the hooks window.__marswalk and window.__missionStore only exist in development) and a
// browser (Chrome or Edge, headless unless --headed). Every step goes through the interface or the engine's input:
// buttons are clicked, keys pressed, and the astronaut walks with the W key at walking pace (1.0 m/s, no jog). The
// only help from the hooks is steering: the script turns the astronaut in place toward the next point
// (__marswalk.place at the current position with a new yaw), as a player would with the mouse. Nothing teleports.
//
// Two kinds of time:
// - dwell: a presenter reading or talking at a screen. Fixed below (DWELL), reported as such;
// - measured: walking, the events (their mission-time triggers), clips, the planner and screen changes.
//
// The steps and selectors sit in the tables below so they can be adjusted when the interface changes. A step whose
// control is not on screen yet is skipped and reported as "not driven".
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

// ---------------------------------------------------------------------------------------------------- budget (s)
// docs/DEMO.md: target 7:30, limit 8:00.
const BUDGET = [
  ['start', 'Start screen, choose mission', 15],
  ['site', 'Table: site and layers', 75],
  ['needs', 'Needs → route, two inputs, why line', 75],
  ['go', 'Outlook, go / no-go, Begin EVA, controls', 30],
  ['walkOut', 'Walk out (visor, minimap, a find)', 60],
  ['stop', 'Stop and sample', 45],
  ['storm', 'Dust storm and re-plan', 30],
  ['radiation', 'Radiation and walk back', 50],
  ['habitat', 'Habitat table: Open plan, Finish EVA', 20],
  ['debrief', 'Debrief', 40],
  ['sources', 'Sources', 10],
];
const TARGET_SEC = 450;
const LIMIT_SEC = 480;

// ---------------------------------------------------------------------------------------------------- dwell (s)
// A presenter's reading and talking time, multiplied by --dwell-scale.
const DWELL = {
  startScreen: 12,     // the title, the intro and the two mission choices
  site: 12,            // the Site step: the plan beat line, where we are
  layer: 8,            // each layer button on the Route step: one decision per layer
  need: 15,            // each of the two needs changed
  profiles: 10,        // the three route profiles compared
  why: 10,             // the why-this-route lines
  hazards: 6,          // the hazard cards: when each event comes in this mission (Hazards step)
  outlook: 6,          // the conditions outlook beside go / no-go (Suit step)
  goNoGo: 4,           // the go / no-go decision (Suit step)
  keys: 6,             // the walk keys card after Begin EVA
  find: 2,             // a look at the find card
  stopLook: 3,         // a look at the stop before sampling
  stormMap: 6,         // the storm's re-plan on the mission table (M)
  radiationMap: 5,     // the radiation re-plan on the mission table (M)
  habitatPlan: 5,      // Open plan at the habitat table
  debrief: 30,         // the debrief: summary, review map, recap
  sources: 8,          // the sources screen
};

// ---------------------------------------------------------------------------------------------------- the walk
// Metres, x east / z south. The detour leaves the planned line toward a find and comes back: 24 m to the side at the
// middle of the leg, so the track is more than 15 m off the plan for about 27 m of walking (src/sim/routeReview.js
// REVIEW_RULES: 15 m out, 20 m long, 10 m back). The debrief then judges a deviation instead of "No deviations".
const WALK = {
  detour: { alongShare: 0.5, offsetM: 24, side: 1 },   // side 1: to the left of the walking direction
  pointToleranceM: 2.5,     // a path point counts as passed within this distance
  stopToleranceM: 1.5,      // how close to the stop the astronaut walks before sampling
  lookDownPitch: 0.55,      // radians, positive looks down (view.js): the crosshair on the ground about 3 m ahead
  samplePitch: 1.0,         // radians: the ground about 1.1 m ahead, within the 1.5 m reach of the scoop (samplingRules.js)
  stuckSec: 2.5,            // no progress for this long: step aside
};

// ---------------------------------------------------------------------------------------------------- selectors
// Text is matched through the i18n catalogs (src/i18n/<lang>.json), so the same steps run in English and Spanish.
const SEL = {
  startPrimary: '.start-primary',
  startFull: '.start-full',
  tab: (id) => `#table-tab-${id}`,
  tablePrimary: '.table-primary',
  layerButtons: '.table-layers:not(.needs-choice) button',
  profileButton: (id) => `.profiles-pick.profile-${id}`,
  // The two needs the presenter changes (src/plan/NeedsPanel.jsx), each undone afterwards in reverse order so the walk
  // is the sortie as planned. Actions: { select, value } sets a <select>; { click, index } presses the index-th match;
  // { marker } presses the map marker whose label holds that text (its stop card opens or closes).
  needs: [
    {
      label: 'goal → Sample Cheyava Falls: the full route, Bright Angel and Cheyava Falls with their cards and photos',
      check: '#needs-objective',
      do: [{ select: '#needs-objective', value: 'cheyava' }, { marker: 'Cheyava' }],
      undo: [{ marker: 'Cheyava' }, { select: '#needs-objective', value: 'sortie' }],
    },
    {
      label: 'risk → cautious: a dearer slope, a bigger reserve',
      check: '.needs-risk button',
      do: [{ click: '.needs-risk button', index: 0 }],
      undo: [{ click: '.needs-risk button', index: 1 }],
    },
  ],
  mapMarkers: '.map-marker-hit',
  whyLines: '.route-why, .table-stop-why',
  outlook: '.outlook-strip',
  keysStart: '.eva-start-dialog .menu-resume',
  menuResume: '.pause-dialog .menu-resume',
  debrief: 'dialog[open] .debrief',
  sourcesOpen: 'dialog[open].sources, .sources[open]',
  sourcesClose: '.sources-close',
};

// ---------------------------------------------------------------------------------------------------- options
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes('--' + name);
const LANG = arg('lang', 'en');
const [VW, VH] = arg('viewport', '1366x768').split('x').map(Number);
const DWELL_SCALE = Number(arg('dwell-scale', 1));
const SHOTS = arg('shots', null);
const HEADED = flag('headed');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const browserPath = arg('browser') || CANDIDATES.find((p) => p && existsSync(p));
if (!browserPath) { console.error('No Chrome or Edge found. Pass --browser <path to chrome or msedge>.'); process.exit(1); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const catalog = JSON.parse(readFileSync(new URL(`../src/i18n/${LANG}.json`, import.meta.url), 'utf8'));
const T = (key) => catalog[key] ?? key;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fmt = (sec) => {
  if (!Number.isFinite(sec)) return '—';
  const whole = Math.round(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------------------------------- segments
const results = [];
const notDriven = [];
const marks = {};
let current = null;
function begin(id) {
  end();
  current = { id, t0: Date.now(), dwell: 0 };
}
function end() {
  if (!current) return;
  results.push({ ...current, sec: (Date.now() - current.t0) / 1000 });
  current = null;
}
async function dwell(seconds) {
  const s = seconds * DWELL_SCALE;
  if (current) current.dwell += s;
  await sleep(s);
}
function skip(what) {
  notDriven.push(`${current?.id ?? '-'}: ${what}`);
  console.log('  not driven: ' + what);
}

// ---------------------------------------------------------------------------------------------------- run
// No hot reload and no file watching: other work saved in the folder during a run must not reload the page mid-EVA.
const server = await createServer({ server: { port: 0, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: !HEADED,
  defaultViewport: { width: VW, height: VH },
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
let page;

const S = (fn, ...a) => page.evaluate(fn, ...a);
const state = () => S(() => {
  const s = window.__missionStore.getState();
  return {
    mode: s.mode, paused: s.mission.paused, t: s.mission.elapsedSec, objective: s.needs?.objective, locked: s.needs?.locked,
    nextIndex: s.route.nextIndex, visited: s.route.visited, path: s.route.path, shelter: s.route.shelter,
    waypoints: s.route.waypoints.map((w) => ({ name: w.name, x: w.x, z: w.z })), decision: s.route.decision,
    alerts: Object.values(s.alerts).filter((a) => a?.active).map((a) => a.eventId),
    events: s.eva.events, phase: s.eva.phase, atHabitat: s.eva.atHabitat, summary: !!s.eva.summary,
    samples: s.sampling.count, sampling: s.sampling.status?.phase ?? null,
    finds: s.finds.list.map((f) => f.status), distanceM: s.eva.distanceM,
  };
});
async function snap(name) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${String(results.length + 1).padStart(2, '0')}-${name}-${VW}-${LANG}.png` });
}
async function waitFor(fn, seconds, label, ...a) {
  try {
    await page.waitForFunction(fn, { timeout: seconds * 1000, polling: 200 }, ...a);
    return true;
  } catch {
    console.log(`  timed out after ${seconds} s: ${label}`);
    return false;
  }
}
async function exists(selector) {
  return S((sel) => [...document.querySelectorAll(sel)].some((el) => el.offsetParent || el.getClientRects().length), selector);
}
async function click(selector) {
  return S((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.offsetParent || e.getClientRects().length) && !e.disabled);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
}
async function clickText(text, scope = 'button') {
  return S((t, sc) => {
    const el = [...document.querySelectorAll(sc)].find((e) => (e.offsetParent || e.getClientRects().length) && !e.disabled && e.textContent.trim().includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text, scope);
}
async function key(code, holdSec = 0) {
  await page.keyboard.down(code);
  if (holdSec > 0) await sleep(holdSec);
  await page.keyboard.up(code);
}

// One needs action (SEL.needs), then a moment for the planner worker to answer.
async function act(action) {
  if (action.select) {
    // React listens for the native change event of a <select>; set the value through the prototype setter first.
    await S((sel, v) => {
      const el = document.querySelector(sel);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, action.select, action.value);
  } else if (action.click) {
    await S((sel, k) => document.querySelectorAll(sel)[k]?.click(), action.click, action.index ?? 0);
  } else if (action.marker) {
    // the planner worker answers first: wait for the marker of the new stop
    await waitFor((sel, text) => [...document.querySelectorAll(sel)].some((el) => el.textContent.includes(text)), 15, `map marker "${action.marker}"`, SEL.mapMarkers, action.marker);
    if (!(await clickText(action.marker, SEL.mapMarkers))) skip(`map marker "${action.marker}"`);
  }
  await sleep(1.5);
}

// Resume after a pause that asked for the pointer: headless browsers refuse the capture, so take drag-to-look then.
async function resumePlay() {
  const playing = () => S(() => !window.__missionStore.getState().mission.paused && !document.querySelector('dialog[open].pause-dialog'));
  for (let i = 0; i < 20; i += 1) {
    if (await playing()) return true;
    const freeLook = await clickText(T('menu.continue.without.mouse.capture'), '.pause-dialog button');
    if (!freeLook && i === 0 && !(await click(SEL.keysStart))) await click(SEL.menuResume);
    await sleep(0.5);
  }
  return playing();
}

// One step of steering, done inside the page so the pose read and the turn happen in the same frame: turn in place
// toward (x, z) when off by more than 3 degrees, and walk.
async function steer(x, z, pitch = 0) {
  return S((tx, tz, pt) => {
    const m = window.__marswalk, p = m.pose();
    const yaw = Math.atan2(tx - p.x, -(tz - p.z));
    let d = yaw - p.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 0.05 || Math.abs(p.pitch - pt) > 0.05) m.place(p.x, p.z, yaw, pt);
    m.walking(true);
    return { x: p.x, z: p.z, dist: Math.hypot(tx - p.x, tz - p.z) };
  }, x, z, pitch);
}
const stopWalking = () => S(() => window.__marswalk.walking(false));

/**
 * Walk along a polyline at walking pace until the last point is within `tolerance` or `until()` is true.
 * @returns {Promise<'arrived' | 'until' | 'timeout'>}
 */
// Walking is measured, so the report says how fast it really went: distance, time, frame rate and step-asides. The
// engine caps a frame's step at 0.1 s (src/engine/index.js), so below 10 fps the astronaut walks slower than 1.0 m/s.
const walking = { sec: 0, metres: 0, fps: [], asides: 0 };

async function walkPath(points, options = {}) {
  const t0 = Date.now();
  const d0 = await S(() => window.__missionStore.getState().eva.distanceM ?? 0);
  const result = await walkPathInner(points, options);
  walking.sec += (Date.now() - t0) / 1000;
  walking.metres += (await S(() => window.__missionStore.getState().eva.distanceM ?? 0)) - d0;
  return result;
}

async function walkPathInner(points, { tolerance = WALK.pointToleranceM, until = null, timeoutS = 240 } = {}) {
  let i = 0;
  const t0 = Date.now();
  let best = Infinity, lastProgress = Date.now(), aside = 0, lastFps = 0;
  while ((Date.now() - t0) / 1000 < timeoutS) {
    if (until && (await until())) { await stopWalking(); return 'until'; }
    if (Date.now() - lastFps > 2000) {
      lastFps = Date.now();
      walking.fps.push(await S(() => window.__marswalk.stats().fps));
    }
    const [px, pz] = points[i];
    const last = i === points.length - 1;
    const r = await steer(px, pz);
    if (r.dist < (last ? tolerance : WALK.pointToleranceM)) {
      if (last) { await stopWalking(); return 'arrived'; }
      i += 1;
      best = Infinity;
      continue;
    }
    if (r.dist < best - 0.3) { best = r.dist; lastProgress = Date.now(); }
    if ((Date.now() - lastProgress) / 1000 > WALK.stuckSec) {
      // Blocked by a rock or a wall the height map does not see: step aside, alternating sides, then carry on.
      aside += 1;
      walking.asides += 1;
      const side = aside % 2 ? 1 : -1;
      await S((s) => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw + s * 1.2, 0); m.walking(true); }, side);
      await sleep(1.5);
      lastProgress = Date.now();
      best = Infinity;
    }
    await sleep(0.15);
  }
  await stopWalking();
  return 'timeout';
}

/** The path from the nearest point of `path` on, so a walk joins a route where the astronaut is. */
function remainingPath(path, from) {
  if (!Array.isArray(path) || path.length === 0) return [];
  let k = 0, best = Infinity;
  path.forEach(([x, z], i) => { const d = Math.hypot(x - from.x, z - from.z); if (d < best) { best = d; k = i; } });
  return path.slice(k);
}

try {
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error: ' + e.message));
  await page.evaluateOnNewDocument((lang) => { try { localStorage.setItem('marswalk.language', lang); } catch { /* fine */ } }, LANG);
  await page.goto(base, { waitUntil: 'load' });
  console.log(`Loading the app (${VW}x${VH}, ${LANG}, dwell x${DWELL_SCALE})…`);
  await page.waitForFunction(() => { const b = document.querySelector('.start-primary'); return b && !b.disabled && window.__marswalk; }, { timeout: 300000, polling: 500 });

  // 1. Start screen ------------------------------------------------------------------------------------------------
  begin('start');
  await snap('start');
  await dwell(DWELL.startScreen);
  await click(SEL.startPrimary);          // the main action: the first sortie
  await waitFor(() => document.querySelector('.table-tabs'), 20, 'mission table');
  const s0 = await state();
  console.log(`  objective ${s0.objective}, waypoints ${s0.waypoints.map((w) => w.name).join(' → ')}`);

  // 2. Table: site and layers ----------------------------------------------------------------------------------------
  begin('site');
  await snap('site');
  await dwell(DWELL.site);
  await click(SEL.tab('route'));
  await waitFor((sel) => document.querySelector(sel), 10, 'layer buttons', SEL.layerButtons);
  const layerCount = await S((sel) => document.querySelectorAll(sel).length, SEL.layerButtons);
  for (let i = 1; i < layerCount; i += 1) {
    await S((sel, k) => document.querySelectorAll(sel)[k]?.click(), SEL.layerButtons, i);
    await dwell(DWELL.layer);
  }
  await S((sel) => document.querySelectorAll(sel)[0]?.click(), SEL.layerButtons);
  await snap('layers');
  console.log(`  ${layerCount} layer buttons shown`);

  // 3. Needs → route, two inputs, profiles, why line -----------------------------------------------------------------
  begin('needs');
  const driven = [];
  for (const need of SEL.needs) {
    if (!(await exists(need.check))) { skip(`needs input "${need.label}" (${need.check})`); continue; }
    for (const action of need.do) await act(action);
    driven.push(need);
    console.log('  ' + need.label);
    await dwell(DWELL.need);
  }
  if (await exists(SEL.profileButton('gentlest'))) {
    await click(SEL.profileButton('gentlest'));
    await dwell(DWELL.profiles / 2);
    await click(SEL.profileButton('fastest'));
    await dwell(DWELL.profiles / 2);
  } else skip('route profile buttons');
  // Back to the defaults, so the walk is the sortie as planned.
  for (const need of [...driven].reverse()) for (const action of need.undo) await act(action);
  await waitFor(() => window.__missionStore.getState().route.waypoints.length === 2 && window.__missionStore.getState().route.path, 15, 'the sortie planned again');
  if (await exists(SEL.whyLines)) await dwell(DWELL.why);
  else { skip(`why-this-route lines (${SEL.whyLines})`); await dwell(DWELL.why); }
  await snap('route');

  // 4. Outlook, go / no-go, Begin EVA, controls ----------------------------------------------------------------------
  begin('go');
  await click(SEL.tab('hazards'));
  await dwell(DWELL.hazards);
  await click(SEL.tab('suit'));
  if (!(await exists(SEL.outlook))) skip(`conditions outlook (${SEL.outlook})`);
  await dwell(DWELL.outlook);
  await dwell(DWELL.goNoGo);
  await snap('go');
  await click(SEL.tablePrimary);          // Begin EVA
  await waitFor((sel) => document.querySelector(sel), 15, 'walk keys card', SEL.keysStart);
  await dwell(DWELL.keys);
  await snap('keys');
  await click(SEL.keysStart);             // Start walking: the EVA clock starts
  if (!(await resumePlay())) throw new Error('The EVA did not start (pause menu still open).');
  const eva0 = await state();
  console.log(`  EVA started at T+${eva0.t.toFixed(1)} s, needs locked: ${eva0.locked}`);

  // 5. Walk out, with a detour to mark a find ------------------------------------------------------------------------
  begin('walkOut');

  const stop = eva0.waypoints[1];
  const start = await S(() => window.__marswalk.pose());
  const ax = start.x, az = start.z, dx = stop.x - ax, dz = stop.z - az, len = Math.hypot(dx, dz);
  // left of the walking direction: forward (dx, dz) turned 90 degrees (x east, z south)
  const lx = (dz / len) * WALK.detour.side, lz = (-dx / len) * WALK.detour.side;
  const detour = [ax + dx * WALK.detour.alongShare + lx * WALK.detour.offsetM, az + dz * WALK.detour.alongShare + lz * WALK.detour.offsetM];
  await snap('walk');
  console.log(`  walking to the find at (${detour[0].toFixed(0)}, ${detour[1].toFixed(0)}), off the ${len.toFixed(0)} m line by ${WALK.detour.offsetM} m`);
  marks.detourResult = await walkPath([detour], { tolerance: 2 });
  // Mark a find: look at the ground ahead and hold Q until the ring closes (FIND_HOLD_MS, 2 s).
  await S((pt) => { const m = window.__marswalk, p = m.pose(); m.walking(false); m.place(p.x, p.z, p.yaw, pt); }, WALK.lookDownPitch);
  await sleep(0.3);
  await key('KeyQ', 2.6);
  const marked = await waitFor(() => window.__missionStore.getState().finds.list.length > 0, 5, 'find marked');
  marks.find = marked;
  await dwell(DWELL.find);
  await snap('find');
  // Keep the route as planned: the find card's N (dismiss) would drop the mark, so the card is left as it is.
  marks.arriveResult = await walkPath([[stop.x, stop.z]], { tolerance: WALK.stopToleranceM });
  const atStop = await state();
  marks.arriveT = atStop.t;
  console.log(`  at the stop at T+${atStop.t.toFixed(1)} s (${marks.arriveResult}), nextIndex ${atStop.nextIndex}, walked ${atStop.distanceM?.toFixed(0)} m`);

  // 6. Stop and sample ---------------------------------------------------------------------------------------------
  begin('stop');
  await dwell(DWELL.stopLook);
  await S((pt) => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, pt); }, WALK.samplePitch);
  await sleep(0.5);
  await key('KeyP');                      // photo
  await sleep(1.5);
  await page.mouse.click(VW / 2, VH / 2); // collect the ground under the crosshair
  await waitFor(() => window.__missionStore.getState().sampling.status?.phase === 'holding', 20, 'scoop full');
  await key('KeyE');                      // stow and seal
  marks.sampled = await waitFor(() => window.__missionStore.getState().sampling.count > 0, 25, 'sample secured');
  const sampled = await state();
  marks.sampledT = sampled.t;
  await snap('sample');
  console.log(`  samples ${sampled.samples} at T+${sampled.t.toFixed(1)} s`);
  await S(() => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, 0); });
  await waitFor(() => window.__missionStore.getState().alerts['dust-storm']?.active, 240, 'dust storm');

  // 7. Dust storm and its re-plan on the map -------------------------------------------------------------------------
  begin('storm');
  const storm = await state();
  marks.stormT = storm.events.find((e) => e.type === 'start' && e.eventId === 'dust-storm')?.atSec ?? storm.t;
  console.log(`  dust storm at T+${marks.stormT.toFixed(1)} s, ${(marks.stormT - marks.arriveT).toFixed(1)} s after reaching the stop`);
  await waitFor(() => window.__missionStore.getState().route.shelter, 15, 'storm re-plan to the habitat');
  await snap('storm-walk');
  await key('KeyM');                      // the mission table: the route home on the map
  await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'table');
  await dwell(DWELL.stormMap);
  await snap('storm-plan');
  await key('KeyM');
  await resumePlay();
  // walk home on the event route until the radiation alert starts
  const home = () => S(() => window.__missionStore.getState().route.path);
  const stormPath = remainingPath(await home(), await S(() => window.__marswalk.pose()));
  await walkPath(stormPath, { until: () => S(() => !!window.__missionStore.getState().alerts.radiation?.active), timeoutS: 120 });

  // 8. Radiation and the walk back -----------------------------------------------------------------------------------
  begin('radiation');
  const rad = await state();
  marks.radiationT = rad.events.find((e) => e.type === 'start' && e.eventId === 'radiation')?.atSec ?? rad.t;
  console.log(`  radiation alert at T+${marks.radiationT.toFixed(1)} s, alerts ${rad.alerts.join(', ')}`);
  await snap('radiation-walk');
  await sleep(1.5);                        // the re-plan request reaches the planner
  await key('KeyM');
  await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'table');
  await dwell(DWELL.radiationMap);
  await snap('radiation-plan');
  await key('KeyM');
  await resumePlay();
  const hab = await S(() => window.__marswalk.habitat());
  const entry = [hab.x + hab.dirX * 9.9, hab.z + hab.dirZ * 9.9];     // the foot of the airlock steps (spawn.js)
  const radPath = remainingPath(await home(), await S(() => window.__marswalk.pose()));
  await walkPath([...radPath, entry], { timeoutS: 150 });
  // up the steps, through the airlock, to the planning table (the cabin, where the table's prompt shows)
  const cabin = [hab.x + hab.dirX * 1.45, hab.z + hab.dirZ * 1.45];
  await walkPath([[hab.x + hab.dirX * 6, hab.z + hab.dirZ * 6], cabin], { tolerance: 0.8, timeoutS: 60 });
  const back = await state();
  marks.backT = back.t;
  console.log(`  in the habitat at T+${back.t.toFixed(1)} s, at the habitat: ${back.atHabitat}, alerts ${back.alerts.join(', ') || 'none'}`);

  // 9. Habitat table: Open plan, Finish EVA --------------------------------------------------------------------------
  begin('habitat');
  await snap('habitat-prompt');
  await key('KeyE');                      // Open plan
  if (await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'Open plan at the habitat table')) {
    await dwell(DWELL.habitatPlan);
    await snap('habitat-plan');
    await key('KeyM');
    await resumePlay();
  } else skip('Open plan (E) at the habitat table');
  await key('KeyX');                      // Finish EVA
  if (!(await waitFor((sel) => document.querySelector(sel), 10, 'debrief', SEL.debrief))) {
    skip('Finish EVA (X) at the habitat table');
    throw new Error('The debrief did not open.');
  }

  // 10. Debrief ----------------------------------------------------------------------------------------------------
  begin('debrief');
  const done = await state();
  marks.endT = done.t;
  await snap('debrief');
  const debriefText = await S((sel) => document.querySelector(sel)?.innerText ?? '', SEL.debrief);
  marks.noDeviations = /No deviations|Sin desv/i.test(debriefText);
  await S((sel, k) => {
    const d = document.querySelector(sel);
    for (const el of [d, d?.closest('dialog')]) if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * k;
  }, SEL.debrief, 0.5);
  await dwell(DWELL.debrief / 2);
  await snap('debrief-review');
  await S((sel, k) => {
    const d = document.querySelector(sel);
    for (const el of [d, d?.closest('dialog')]) if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) * k;
  }, SEL.debrief, 1);
  await dwell(DWELL.debrief / 2);
  await snap('debrief-end');

  // 11. Sources ----------------------------------------------------------------------------------------------------
  begin('sources');
  if (!(await clickText(T('debrief.sources'), '.debrief-actions button'))) skip('Sources on the debrief');
  await waitFor(() => document.querySelector('.sources'), 10, 'sources screen');
  await dwell(DWELL.sources);
  await snap('sources');
  await click(SEL.sourcesClose);
  end();

  // ---------------------------------------------------------------------------------------------------- report
  const byId = new Map(results.map((r) => [r.id, r]));
  let total = 0, budgetTotal = 0, dwellTotal = 0;
  console.log(`\n| # | Segment | Budget | Actual | of which dwell | Measured |\n|---|---|---|---|---|---|`);
  BUDGET.forEach(([id, name, budget], index) => {
    const r = byId.get(id);
    total += r?.sec ?? 0; budgetTotal += budget; dwellTotal += r?.dwell ?? 0;
    console.log(`| ${index + 1} | ${name} | ${fmt(budget)} | ${fmt(r?.sec)} | ${fmt(r?.dwell)} | ${fmt(r ? r.sec - r.dwell : NaN)} |`);
  });
  console.log(`| | **Total** | **${fmt(budgetTotal)}** | **${fmt(total)}** | ${fmt(dwellTotal)} | ${fmt(total - dwellTotal)} |`);
  console.log(`\nTarget ${fmt(TARGET_SEC)}, limit ${fmt(LIMIT_SEC)}: ${total <= LIMIT_SEC ? 'within the limit' : 'OVER the limit'} (${fmt(total)}).`);
  const evaWall = ['walkOut', 'stop', 'storm', 'radiation', 'habitat'].reduce((sum, id) => sum + (byId.get(id)?.sec ?? 0), 0);
  console.log(`EVA (Start walking to the debrief): ${fmt(evaWall)} of play, mission clock T+${marks.endT?.toFixed(0)} s.`);
  console.log(`Mission times: at the stop T+${marks.arriveT?.toFixed(0)} s, sample secured T+${marks.sampledT?.toFixed(0)} s, storm T+${marks.stormT?.toFixed(0)} s, radiation T+${marks.radiationT?.toFixed(0)} s, back in the habitat T+${marks.backT?.toFixed(0)} s.`);
  console.log(`Find marked: ${marks.find ? 'yes' : 'no'}. Debrief review: ${marks.noDeviations ? '"No deviations"' : 'a deviation with its verdict'}.`);
  const fps = walking.fps.filter(Number.isFinite);
  const speed = walking.sec > 0 ? walking.metres / walking.sec : NaN;
  console.log(`Walking: ${walking.metres.toFixed(0)} m in ${walking.sec.toFixed(0)} s, ${speed.toFixed(2)} m/s with the turns and stops; `
    + `${fps.length ? Math.min(...fps) + ' to ' + Math.max(...fps) : '?'} fps; ${walking.asides} step-asides.`);
  if (fps.length && Math.min(...fps) < 12) console.log('Warning: the browser fell below 12 fps, so the walk ran slower than 1.0 m/s (the engine caps a frame at 0.1 s). Measure on a quieter machine or with --headed.');
  if (notDriven.length) console.log('\nNot driven (control not on screen yet):\n- ' + notDriven.join('\n- '));
} finally {
  await browser.close();
  await server.close();
}
