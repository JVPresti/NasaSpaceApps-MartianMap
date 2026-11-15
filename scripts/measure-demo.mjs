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
  ['site', 'Table: site, goal Cheyava Falls, the layers and what each decides', 65],
  ['needs', 'Two contrasting plans, profiles, a stop card, back to the sortie', 55],
  ['go', 'Hazards, outlook, go / no-go, Begin EVA, keys, help (H)', 35],
  ['walkOut', 'Walk out: HUD, wrist (R), slope grid (G), visor (V), a find', 95],
  ['stop', 'Science stop and sample', 20],
  ['storm', 'Dust storm and its re-plan on the table', 20],
  ['radiation', 'Radiation, walk back, hand-over (F)', 70],
  ['habitat', 'Habitat: settings and language, Open plan, Finish EVA', 20],
  ['debrief', 'Debrief', 45],
  ['sources', 'Sources', 10],
];
const TARGET_SEC = 450;
const LIMIT_SEC = 480;

// ---------------------------------------------------------------------------------------------------- dwell (s)
// A presenter's reading and talking time, multiplied by --dwell-scale (1.3 for a presenter 30 % slower).
const DWELL = {
  startScreen: 12,     // the title, the intro and the two mission choices
  site: 8,            // the Site step: where we are, the plan beat line
  goal: 4,             // the goal set to Cheyava Falls: the 934 m route appears
  terrain: 8,         // Terrain, with risk set to cautious: where the route bends and why
  rocks: 4,            // Rocks: the cost the cautious risk puts on rock cover
  outcrop: 5,          // Outcrop: the stops the plan kept, on light-toned rock
  radio: 8,           // Radio shadow, with a crew of one: the radio route, Bright Angel dropped
  exposure: 5,         // Exposure: which shelter the re-plan would choose
  rover: 3,            // Perseverance's drives on and off
  planA: 8,           // plan A: solo, cautious, 100 min, with its why lines and the stop it drops
  planB: 8,           // plan B: pair, bold, 2 h, both stops
  profiles: 6,         // the three route profiles compared
  card: 14,            // the Cheyava Falls stop card with Perseverance's images
  hazards: 8,          // the hazard cards: when each event comes in this mission (Hazards step)
  outlook: 8,          // the conditions outlook beside go / no-go (Suit step)
  goNoGo: 4,           // the go / no-go decision (Suit step)
  keys: 4,             // the walk keys card after Begin EVA
  help: 5,             // the controls help (H)
  wrist: 5,            // the wrist screen: a layer chosen on the arm, the map page
  slopeGrid: 2,        // the slope grid (G) on, then off
  visor: 2,            // the visor frame (V) off, then on
  find: 5,             // the find card: its detour price, then Y (add to the route)
  stopLook: 3,         // the science stop's beat line before sampling
  stormMap: 5,         // the storm's re-plan on the mission table (M)
  radiationMap: 4,     // the radiation re-plan on the mission table (M)
  handOver: 2,         // the partner's case after the hand-over
  language: 6,         // Esc, Settings: the interface switched to Spanish and back
  habitatPlan: 4,      // Open plan at the habitat table
  debrief: 40,         // the debrief: summary, review map, recap
  sources: 8,          // the sources screen
};

// ---------------------------------------------------------------------------------------------------- the walk
// Metres, x east / z south. The detour leaves the planned line toward a find and comes back: 24 m to the side at the
// middle of the leg, so the track is more than 15 m off the plan for about 27 m of walking (src/sim/routeReview.js
// REVIEW_RULES: 15 m out, 20 m long, 10 m back). The debrief then judges a deviation instead of "No deviations".
const WALK = {
  hudM: 12,                 // walk this far along the route before the wrist, G and V
  detour: { alongShare: 0.5, offsetM: 24, side: 1 },   // side 1: to the left of the walking direction
  findAnswer: 'KeyY',       // the find card: Y adds the find to the route (a presenter shows the decision), N dismisses
  pointToleranceM: 2.5,     // a path point counts as passed within this distance
  stopToleranceM: 1.5,      // how close to the stop the astronaut walks before sampling
  lookDownPitch: 0.55,      // radians, positive looks down (view.js): the crosshair on the ground about 3 m ahead
  samplePitch: 1.0,         // radians: the ground about 1.1 m ahead, within the 1.5 m reach of the scoop (samplingRules.js)
  handOverM: 9.9 + 4,       // the hand-over (F) is done this far out along the airlock axis, near the partner's patrol
  stuckSec: 2.5,            // no progress for this long: step aside
};

// ---------------------------------------------------------------------------------------------------- selectors
// Text is matched through the i18n catalogs (src/i18n/<lang>.json), so the same steps run in English and Spanish.
const SEL = {
  startPrimary: '.start-primary',
  startFull: '.start-full',
  tab: (id) => `#table-tab-${id}`,
  tablePrimary: '.table-primary',
  // the table's layer buttons in LAYERS order (src/plan/layers.js): Image, Terrain, Rocks, Outcrop, Radio, Exposure
  layerButtons: '.table-layers:not(.needs-choice) button',
  layer: { image: 0, terrain: 1, rocks: 2, outcrop: 3, radio: 4, exposure: 5 },
  roverToggle: '.table-overlay-toggle',
  profileButton: (id) => `.profiles-pick.profile-${id}`,
  // the crew's needs (src/plan/NeedsPanel.jsx)
  goal: '#needs-objective',
  crew: '.needs-crew button',          // 0: one astronaut, 1: two
  risk: '.needs-risk button',          // 0: cautious, 1: standard, 2: bold
  time: '#needs-time',                 // minutes
  map: '.table-map',
  mapMarkers: '.map-marker-hit',
  openCard: '.map-pop-science',        // "Open the science card" in a marker's details
  card: '.stop-card-plan',
  cardClose: '.stop-card-plan .stop-close',
  whyLines: '.route-why, .table-stop-why',
  outlook: '.outlook-strip',
  keysStart: '.eva-start-dialog .menu-resume',
  menuResume: '.pause-dialog .menu-resume',
  controlsClose: 'dialog[open].controls-dialog .ui-button.ghost',
  settingsLanguage: '#interface-language',
  settingsClose: '.settings-panel .dialog-head .ui-button',
  debrief: 'dialog[open] .debrief',
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
// Sub-steps worth timing on their own, for the report (seconds, wall clock).
const steps = {};
const timeStep = async (name, fn) => { const t0 = Date.now(); const result = await fn(); steps[name] = (steps[name] ?? 0) + (Date.now() - t0) / 1000; return result; };
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

// One action on a control ({ select, value } sets a <select>, { click, index } presses the index-th match, { marker }
// presses the map marker whose label holds that text), then a moment for the interface or the planner to answer.
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
  await sleep(action.wait ?? 1.5);
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

// Features the run shows, for the report: name -> true once driven.
const features = {};
const shown = (name, ok = true) => { features[name] = features[name] || ok; if (!ok) skip(name); };

/** Set a range input as a drag would: React reads the native input event. */
async function setRange(selector, value) {
  return S((sel, v) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, selector, value);
}
const clickIndex = (selector, index) => S((sel, k) => { const el = document.querySelectorAll(sel)[k]; if (!el || el.disabled) return false; el.click(); return true; }, selector, index);
const layerButton = (name) => clickIndex(SEL.layerButtons, SEL.layer[name]);
/** Wait for the planner's answer to a change of the needs: the route's waypoints satisfy `test` and a path exists. */
const planned = (test, label) => waitFor((src) => {
  const r = window.__missionStore.getState().route;
  return Array.isArray(r.path) && r.path.length > 1 && new Function('route', 'return ' + src)(r);
}, 20, label, test);
const planSummary = () => S(() => {
  const r = window.__missionStore.getState().route, n = window.__missionStore.getState().needs;
  return {
    needs: `${n.crew === 1 ? 'solo' : 'pair'}, ${n.risk}, ${n.timeMin} min`, profile: r.profile,
    stops: (r.stops ?? []).map((s) => s.id).join(' + '), dropped: (r.dropped ?? []).map((d) => `${d.id} (${d.limit})`).join(', ') || 'none',
    km: r.distanceM != null ? (r.distanceM / 1000).toFixed(2) : '?', fits: r.budget?.fits,
  };
});
async function resumeFromMenu() {
  await click(SEL.menuResume);
  return resumePlay();
}

try {
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  page error: ' + e.message));
  await page.evaluateOnNewDocument((lang) => { try { localStorage.setItem('marswalk.language', lang); } catch { /* fine */ } }, LANG);
  await page.goto(base, { waitUntil: 'load', timeout: 300000 });
  console.log(`Loading the app (${VW}x${VH}, ${LANG}, dwell x${DWELL_SCALE})…`);
  await page.waitForFunction(() => { const b = document.querySelector('.start-primary'); return b && !b.disabled && window.__marswalk; }, { timeout: 300000, polling: 500 });

  // 1. Start screen ------------------------------------------------------------------------------------------------
  begin('start');
  await snap('start');
  await dwell(DWELL.startScreen);
  shown('start screen and its two missions', await exists(SEL.startFull));
  await click(SEL.startPrimary);          // the main action: the first sortie
  await waitFor(() => document.querySelector('.table-tabs'), 20, 'mission table');
  const s0 = await state();
  console.log(`  objective ${s0.objective}, waypoints ${s0.waypoints.map((w) => w.name).join(' → ')}`);

  // 2. Table: site, then the goal set to Cheyava Falls and the layers on its 934 m route -------------------------------
  begin('site');
  await snap('site');
  await dwell(DWELL.site);
  shown('Site step and the plan beat line', await exists('.mission-beat'));
  await click(SEL.tab('route'));
  await waitFor((sel) => document.querySelector(sel), 10, 'needs panel', SEL.goal);
  await act({ select: SEL.goal, value: 'cheyava' });
  shown('goal: Sample Cheyava Falls', await planned('route.waypoints.some((w) => w.stopId === "cheyava-falls")', 'the Cheyava Falls route'));
  // the map: scroll in on the route, then back out (the fit button would do the same)
  const box = await S((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, SEL.map);
  if (box) {
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel({ deltaY: -400 });
    await sleep(0.8);
    await page.mouse.wheel({ deltaY: 400 });
  }
  shown('HiRISE map zoom (scroll)', !!box);
  await dwell(DWELL.goal);
  await layerButton('terrain');
  await clickIndex(SEL.risk, 0);          // cautious: a dearer slope
  await planned('window.__missionStore.getState().needs.risk === "cautious"', 'the cautious plan');
  shown('layer Terrain with risk cautious');
  await dwell(DWELL.terrain);
  await snap('layer-terrain');
  await layerButton('rocks');
  shown('layer Rocks');
  await dwell(DWELL.rocks);
  await layerButton('outcrop');
  shown('layer Outcrop with the kept stops');
  await dwell(DWELL.outcrop);
  await layerButton('radio');
  await clickIndex(SEL.crew, 0);          // a crew of one: the radio route
  await planned('route.profile !== undefined && window.__missionStore.getState().needs.crew === 1', 'the solo plan');
  await sleep(1.5);
  const solo = await planSummary();
  shown('layer Radio with a crew of one (radio route, a stop dropped)', solo.dropped !== 'none');
  console.log(`  solo + cautious: ${solo.km} km, stops ${solo.stops}, dropped ${solo.dropped}, profile ${solo.profile}`);
  await dwell(DWELL.radio);
  await snap('layer-radio');
  await layerButton('exposure');
  shown('layer Exposure');
  await dwell(DWELL.exposure);
  const rover = await click(SEL.roverToggle);
  await dwell(DWELL.rover / 2);
  if (rover) await click(SEL.roverToggle);
  await dwell(DWELL.rover / 2);
  shown('Perseverance drives (Rover)', rover);
  await layerButton('image');

  // 3. Two contrasting plans, profiles, a stop card, back to the first sortie --------------------------------------
  begin('needs');
  await setRange(SEL.time, 100);          // plan A: solo, cautious, 100 min
  await planned('window.__missionStore.getState().needs.timeMin === 100', 'plan A');
  await sleep(1.5);
  const planA = await planSummary();
  console.log(`  plan A (${planA.needs}): ${planA.km} km, stops ${planA.stops}, dropped ${planA.dropped}, fits ${planA.fits}`);
  shown('why-this-route lines', await exists(SEL.whyLines));
  await dwell(DWELL.planA);
  await snap('plan-a');
  await clickIndex(SEL.crew, 1);          // plan B: pair, bold, 2 h
  await clickIndex(SEL.risk, 2);
  await setRange(SEL.time, 120);
  await planned('window.__missionStore.getState().needs.timeMin === 120 && route.waypoints.length >= 3', 'plan B');
  await sleep(1.5);
  const planB = await planSummary();
  console.log(`  plan B (${planB.needs}): ${planB.km} km, stops ${planB.stops}, dropped ${planB.dropped}, fits ${planB.fits}`);
  shown('two contrasting plans', planA.stops !== planB.stops);
  await dwell(DWELL.planB);
  await snap('plan-b');
  if (await exists(SEL.profileButton('gentlest'))) {
    await click(SEL.profileButton('gentlest'));
    await dwell(DWELL.profiles / 2);
    await click(SEL.profileButton('fastest'));
    await dwell(DWELL.profiles / 2);
    shown('route profiles');
  } else shown('route profiles', false);
  await act({ marker: 'Cheyava', wait: 0.5 });   // the marker's details, then the Cheyava Falls card and its images
  await click(SEL.openCard);
  const card = await waitFor((sel) => document.querySelector(sel), 5, 'Cheyava Falls card', SEL.card);
  shown('Cheyava Falls stop card and Perseverance images', card);
  await dwell(DWELL.card);
  await snap('card');
  await click(SEL.cardClose);
  // back to the first sortie: standard risk, the goal (its time comes back to 30 min)
  await clickIndex(SEL.risk, 1);
  await act({ select: SEL.goal, value: 'sortie' });
  await planned('route.waypoints.length === 2 && window.__missionStore.getState().needs.objective === "sortie"', 'the sortie planned again');
  await snap('route');

  // 4. Hazards, outlook, go / no-go, Begin EVA, keys, help -----------------------------------------------------------
  begin('go');
  await click(SEL.tab('hazards'));
  shown('hazard cards');
  await dwell(DWELL.hazards);
  await click(SEL.tab('suit'));
  shown('conditions outlook', await exists(SEL.outlook));
  await dwell(DWELL.outlook);
  await dwell(DWELL.goNoGo);
  await snap('go');
  await timeStep('Begin EVA to the keys card', async () => {
    await click(SEL.tablePrimary);        // Begin EVA
    await waitFor((sel) => document.querySelector(sel), 15, 'walk keys card', SEL.keysStart);
  });
  await dwell(DWELL.keys);
  await snap('keys');
  await click(SEL.keysStart);             // Start walking: the EVA clock starts
  if (!(await timeStep('Start walking to play', resumePlay))) throw new Error('The EVA did not start (pause menu still open).');
  const eva0 = await state();
  console.log(`  EVA started at T+${eva0.t.toFixed(1)} s, needs locked: ${eva0.locked}`);
  await key('KeyH');                      // the controls help, with the pause behind it
  const help = await waitFor(() => document.querySelector('dialog[open].controls-dialog'), 5, 'controls help (H)');
  await dwell(DWELL.help);
  await snap('help');
  await timeStep('help closed to play', async () => { await click(SEL.controlsClose); await resumeFromMenu(); });
  shown('controls help (H) and the pause menu', help);

  // 5. Walk out: HUD, wrist, slope grid, visor frame, a detour to a find --------------------------------------------
  begin('walkOut');
  const stop = eva0.waypoints[1];
  const start = await S(() => window.__marswalk.pose());
  const ax = start.x, az = start.z, dx = stop.x - ax, dz = stop.z - az, len = Math.hypot(dx, dz);
  await walkPath([[ax + (dx / len) * WALK.hudM, az + (dz / len) * WALK.hudM]], { tolerance: 1.5 });
  await snap('walk');
  // the wrist screen: R up, the next layer row chosen with J and Enter, the map page with ], R down
  const layer0 = await S(() => window.__missionStore.getState().view.layer);
  await key('KeyR');
  const wristUp = await waitFor(() => window.__marswalkWrist?.snapshot().open === true, 5, 'wrist screen up');
  await sleep(0.8);
  await key('KeyJ');
  await key('Enter');
  await sleep(0.5);
  const wristLayer = await S(() => window.__missionStore.getState().view.layer);
  await snap('wrist');
  await key('BracketRight');
  await dwell(DWELL.wrist);
  await key('KeyR');
  await waitFor(() => window.__marswalkWrist?.snapshot().open === false, 5, 'wrist screen down');
  await key('Digit0');                    // the layer off again
  shown('wrist screen: a layer chosen on the arm, the map page', wristUp && wristLayer !== layer0);
  await key('KeyG');                      // the slope grid
  const grid = await waitFor(() => window.__missionStore.getState().view.slopeGrid === true, 3, 'slope grid on');
  await dwell(DWELL.slopeGrid);
  await snap('slope-grid');
  await key('KeyG');
  shown('slope grid (G)', grid);
  await key('KeyV');                      // the visor frame off and on
  const visor = await waitFor(() => window.__missionStore.getState().settings.visorFrame === false, 3, 'visor frame off');
  await dwell(DWELL.visor);
  await key('KeyV');
  shown('visor frame (V)', visor);
  // left of the walking direction: forward (dx, dz) turned 90 degrees (x east, z south)
  const lx = (dz / len) * WALK.detour.side, lz = (-dx / len) * WALK.detour.side;
  const detour = [ax + dx * WALK.detour.alongShare + lx * WALK.detour.offsetM, az + dz * WALK.detour.alongShare + lz * WALK.detour.offsetM];
  console.log(`  walking to the find at (${detour[0].toFixed(0)}, ${detour[1].toFixed(0)}), off the ${len.toFixed(0)} m line by ${WALK.detour.offsetM} m`);
  marks.detourResult = await walkPath([detour], { tolerance: 2 });
  // Mark a find: look at the ground ahead and hold Q until the ring closes (FIND_HOLD_MS, 2 s).
  await S((pt) => { const m = window.__marswalk, p = m.pose(); m.walking(false); m.place(p.x, p.z, p.yaw, pt); }, WALK.lookDownPitch);
  await sleep(0.3);
  await key('KeyQ', 2.6);
  marks.find = await waitFor(() => window.__missionStore.getState().finds.list.some((f) => f.status === 'priced'), 8, 'find priced');
  await dwell(DWELL.find);
  await snap('find');
  await key(WALK.findAnswer);             // answer the card as a presenter would (Y: add it to the route)
  marks.findStatus = await S(() => window.__missionStore.getState().finds.list.map((f) => f.status).join(','));
  shown('mark a find (Q) and answer its card', marks.find);
  await S(() => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, 0); });
  marks.arriveResult = await walkPath([[stop.x, stop.z]], { tolerance: WALK.stopToleranceM });
  const atStop = await state();
  marks.arriveT = atStop.t;
  console.log(`  at the stop at T+${atStop.t.toFixed(1)} s (${marks.arriveResult}), find ${marks.findStatus}, walked ${atStop.distanceM?.toFixed(0)} m`);

  // 6. Science stop and sample -------------------------------------------------------------------------------------
  begin('stop');
  shown('the science stop beat line', await exists('.mission-beat[data-beat="stop"]'));
  await snap('stop');
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
  shown('sampling: photo, collect, stow', marks.sampled);
  await snap('sample');
  console.log(`  samples ${sampled.samples} at T+${sampled.t.toFixed(1)} s`);
  await S(() => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, 0); });
  await waitFor(() => window.__missionStore.getState().alerts['dust-storm']?.active, 240, 'dust storm');

  // 7. Dust storm and its re-plan on the map -------------------------------------------------------------------------
  begin('storm');
  const storm = await state();
  marks.stormT = storm.events.find((e) => e.type === 'start' && e.eventId === 'dust-storm')?.atSec ?? storm.t;
  console.log(`  dust storm at T+${marks.stormT.toFixed(1)} s, ${(marks.stormT - marks.sampledT).toFixed(1)} s after the sample`);
  await waitFor(() => window.__missionStore.getState().route.shelter, 15, 'storm re-plan to the habitat');
  await snap('storm-walk');
  await key('KeyM');                      // the mission table, on its Route step: the route home on the map
  await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'table');
  await dwell(DWELL.stormMap);
  await snap('storm-plan');
  await key('KeyM');
  await resumePlay();
  shown('dust storm and its re-plan', true);
  // walk home on the event route until the radiation alert starts
  const home = () => S(() => window.__missionStore.getState().route.path);
  const stormPath = remainingPath(await home(), await S(() => window.__marswalk.pose()));
  await walkPath(stormPath, { until: () => S(() => !!window.__missionStore.getState().alerts.radiation?.active), timeoutS: 120 });

  // 8. Radiation, the walk back and the hand-over -------------------------------------------------------------------
  begin('radiation');
  const rad = await state();
  marks.radiationT = rad.events.find((e) => e.type === 'start' && e.eventId === 'radiation')?.atSec ?? rad.t;
  marks.radiationFrom = await S(() => { const p = window.__marswalk.pose(); return Math.hypot(p.x - 535.1, p.z - 574.1); });
  console.log(`  radiation alert at T+${marks.radiationT.toFixed(1)} s, ${marks.radiationFrom.toFixed(0)} m from the airlock, alerts ${rad.alerts.join(', ')}`);
  await snap('radiation-walk');
  await sleep(1.5);                        // the re-plan request reaches the planner
  await key('KeyM');
  await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'table');
  await dwell(DWELL.radiationMap);
  await snap('radiation-plan');
  await key('KeyM');
  await resumePlay();
  shown('radiation alert and its re-plan', true);
  const hab = await S(() => window.__marswalk.habitat());
  const at = (m) => [hab.x + hab.dirX * m, hab.z + hab.dirZ * m];
  // the hand-over: the partner is called with the case now (F), and walks out to meet the crew on its way home; where
  // the case goes down, a second sample is poured into it (F) and the partner closes the lid
  const handOver0 = Date.now();
  await key('KeyF');
  const caseState = () => S(() => window.__missionStore.getState().sampling.status ?? {});
  const radPath = remainingPath(await home(), await S(() => window.__marswalk.pose()));
  await walkPath([...radPath, at(WALK.handOverM)], { timeoutS: 150, until: async () => (await caseState()).caseState === 'down' });
  const caseDown = await waitFor(() => window.__missionStore.getState().sampling.status?.caseState === 'down', 30, 'the case down');
  await S((pt) => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, pt); }, WALK.samplePitch);
  await sleep(0.5);
  await page.mouse.click(VW / 2, VH / 2);
  const second = await waitFor(() => window.__missionStore.getState().sampling.status?.phase === 'holding', 15, 'second sample in the scoop');
  if (!(await caseState()).caseInReach) {
    // step toward the partner, who stands by the case
    const partner = await S(() => window.__marswalk.partnerState());
    if (partner) await walkPath([[partner.x, partner.z]], { tolerance: 1.2, timeoutS: 20, until: async () => (await caseState()).caseInReach === true });
  }
  await key('KeyF');                      // pour into the case
  const handed = await waitFor(() => window.__missionStore.getState().sampling.count >= 2, 30, 'sample in the case');
  steps['hand-over (F to the case closed)'] = (Date.now() - handOver0) / 1000;
  await dwell(DWELL.handOver);
  await snap('hand-over');
  shown('hand-over to the partner (F)', second && caseDown && handed);
  await S(() => { const m = window.__marswalk, p = m.pose(); m.place(p.x, p.z, p.yaw, 0); });
  // up the steps, through the airlock, to the planning table (the cabin, where the table's prompt shows)
  const homePath = remainingPath(await home(), await S(() => window.__marswalk.pose()));
  await walkPath([...homePath, at(9.9), at(6), at(1.45)], { tolerance: 0.8, timeoutS: 120 });
  const back = await state();
  marks.backT = back.t;
  console.log(`  in the habitat at T+${back.t.toFixed(1)} s, at the habitat: ${back.atHabitat}, alerts ${back.alerts.join(', ') || 'none'}, target ${back.shelter?.id ?? 'none'}`);

  // 9. Habitat: settings and language, Open plan, Finish EVA ---------------------------------------------------------
  begin('habitat');
  await snap('habitat-prompt');
  await key('Escape');                    // the pause menu, then Settings: the interface language
  const menu = await waitFor(() => document.querySelector('dialog[open].pause-dialog'), 5, 'pause menu');
  await clickText(T('menu.settings'), '.pause-dialog button');
  const settings = await waitFor((sel) => document.querySelector(sel), 5, 'settings', SEL.settingsLanguage);
  const other = LANG === 'es' ? 'en' : 'es';
  await act({ select: SEL.settingsLanguage, value: other, wait: 0.5 });
  await dwell(DWELL.language);
  await snap('language');
  await act({ select: SEL.settingsLanguage, value: LANG, wait: 0.5 });
  await click(SEL.settingsClose);
  await resumeFromMenu();
  shown('pause menu, settings and language', menu && settings);
  await key('KeyE');                      // Open plan
  if (await waitFor(() => window.__missionStore.getState().mode === 'plan', 5, 'Open plan at the habitat table')) {
    await dwell(DWELL.habitatPlan);
    await snap('habitat-plan');
    await key('KeyM');
    await resumePlay();
    shown('habitat table: Open plan');
  } else shown('habitat table: Open plan', false);
  await key('KeyX');                      // Finish EVA
  if (!(await waitFor((sel) => document.querySelector(sel), 10, 'debrief', SEL.debrief))) {
    shown('habitat table: Finish EVA', false);
    throw new Error('The debrief did not open.');
  }
  shown('habitat table: Finish EVA');

  // 10. Debrief ----------------------------------------------------------------------------------------------------
  begin('debrief');
  const done = await state();
  marks.endT = done.t;
  await snap('debrief');
  const debriefText = await S((sel) => document.querySelector(sel)?.innerText ?? '', SEL.debrief);
  marks.noDeviations = /No deviations|Sin desv/i.test(debriefText);
  marks.verdict = (debriefText.match(/\d+ (deviation|desv)[^\n]*/i) ?? [''])[0];
  shown('debrief: route review with a verdict', !marks.noDeviations);
  shown('debrief: beat recap', await exists('[aria-labelledby="mission-recap-title"]'));
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
  shown('sources screen', await clickText(T('debrief.sources'), '.debrief-actions button'));
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
  console.log(`With a presenter 30 % slower (dwell x${(DWELL_SCALE * 1.3).toFixed(2)}): about ${fmt(total + dwellTotal * 0.3)}.`);
  console.log(`Find marked: ${marks.find ? 'yes' : 'no'}. Debrief review: ${marks.noDeviations ? '"No deviations"' : 'a deviation with its verdict'}.`);
  const fps = walking.fps.filter(Number.isFinite);
  const speed = walking.sec > 0 ? walking.metres / walking.sec : NaN;
  console.log(`Walking: ${walking.metres.toFixed(0)} m in ${walking.sec.toFixed(0)} s, ${speed.toFixed(2)} m/s with the turns and stops; `
    + `${fps.length ? Math.min(...fps) + ' to ' + Math.max(...fps) : '?'} fps; ${walking.asides} step-asides.`);
  if (fps.length && Math.min(...fps) < 12) console.log('Warning: the browser fell below 12 fps, so the walk ran slower than 1.0 m/s (the engine caps a frame at 0.1 s). Measure on a quieter machine or with --headed.');
  console.log(`Find card answered ${WALK.findAnswer === 'KeyY' ? 'Y (added to the route)' : 'N (dismissed)'}: ${marks.findStatus || 'no find left in the list'}. Debrief: ${marks.verdict || '?'}`);
  console.log(`Radiation alert started ${marks.radiationFrom?.toFixed(0)} m from the airlock (the end area is 25 m).`);
  console.log('Sub-steps: ' + Object.entries(steps).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join('; '));
  const steadySec = walking.metres / 0.97;   // 0.97 m/s: a clean run's pace with the turns and stops
  if (walking.sec > steadySec + 5) console.log(`At a steady 0.97 m/s the walking would take ${steadySec.toFixed(0)} s instead of ${walking.sec.toFixed(0)} s: total about ${fmt(total - walking.sec + steadySec)}.`);
  const featureList = Object.entries(features);
  console.log(`\nFeatures driven: ${featureList.filter(([, ok]) => ok).length} of ${featureList.length}`);
  for (const [name, ok] of featureList) console.log(`- ${ok ? 'yes' : 'NO '} ${name}`);
  if (notDriven.length) console.log('\nNot driven (control not on screen yet):\n- ' + notDriven.join('\n- '));
} finally {
  await browser.close();
  await server.close();
}
