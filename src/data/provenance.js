import { t, translateText } from '../i18n/index.js';
/**
 * Provenance registry (#62): where each value on screen comes from.
 *
 * Every store path that the interface shows has one entry: its tag (DATA, DERIVED or SIM, plan section 4.1)
 * and, when the value rests on NASA data, the mission, instrument, site, sol or date and a link. Entries start
 * from the declarations in this file; `loadData` then fills them from the provenance blocks of
 * `public/data/*.json`, read through the existing loaders in `src/data/`.
 *
 * The store's `sources` map stays the live answer: the writer of a value knows whether this sample was
 * measured or interpolated. `resolve(path, live)` puts the two together. The registry gives the static
 * provenance and the store entry overrides the tag, label and source line.
 *
 * Plain JavaScript, no React and no three.js. The component is src/components/SourceTag.jsx.
 */
import { hudLabel, MEDA_SOL_PATH, parseMedaSol, parseRad, RAD_PATH } from './medaRad.js';
import { loadDataFile } from './dataFiles.js';
import { TASK_WORK_NOTES } from '../sim/sampleTasks.js';

export const HAZARDS_PATH = 'data/hazards.json';
export const CREDITS_PATH = 'data/credits.json';

export const TAGS = Object.freeze(['DATA', 'DERIVED', 'SIM']);

/** One-line meaning of each tag, as in public/data/README.md. */
export const TAG_MEANING = Object.freeze({
  DATA: 'Measured by a NASA mission or stated in a NASA document',
  DERIVED: 'Calculated by us from measured data',
  SIM: 'Our model, assumption or scripted event',
});

const HIRISE = { credits: 'hirise-dtm-jezero' };
const PLANNER = { tag: 'DERIVED', label: 'HiRISE DTM', source: 'A* planner on the HiRISE height map (terrain.json)', from: HIRISE };
const SUIT_O2 = ['suit.o2.primary_usable', 'metabolic.minetti_table', 'metabolic.model_mass', 'metabolic.energy_per_litre_o2', 'mobility.speed_rule'];
const SUIT_BATTERY = ['suit.battery.primary_capacity', 'suit.battery.average_draw', 'suit.battery.effort_share'];
const SUIT_MARGIN = [...SUIT_O2, 'suit.reserve.time', 'suit.reserve.walkback_pad', 'suit.alert.caution_margin', 'suit.alert.warning_margin'];
const suitModel = (source, ids) => ({ tag: 'DERIVED', label: 'Suit model', source, from: { hazards: ids } });
const sim = (source) => ({ tag: 'SIM', source });

// Plan route costs (src/sim/legCosts.js) take the weakest tag of their hazards.json inputs (combinedTag). Time, O2,
// battery and margin all rest on the SIM speed rule (mobility.speed_rule), so they are SIM here too: the Plan chips
// "O2 out" and "Battery out" then show the same tag as their tooltip (#196). provenance.test.js checks the match.
const routeModel = (source, ids) => ({ ...suitModel(source, ids), tag: 'SIM' });
const LEG_TERRAIN = { tag: 'DERIVED', label: 'HiRISE DTM', source: 'planner path on the HiRISE height map, sampled every 10 m', from: HIRISE };
const LEG_TIME = routeModel('suit model: walking speed at constant effort, plus the work time at each stop', SUIT_O2);
const LEG_O2 = routeModel('suit model: walking O2 use plus the work at the stops, share of the xEMU primary tank', [...SUIT_O2, 'suit.metabolic.design_average']);
const LEG_BATTERY = routeModel('suit model: xEMU battery, the effort share of the draw is SIM', [...SUIT_BATTERY, 'mobility.speed_rule']);
const LEG_MARGIN = routeModel('suit model: O2 after the walk out, the work at the stops and the padded walk home, minus the 30 min reserve', SUIT_MARGIN);
// Work at the stops (#247): the work time is our estimate per stop (public/data/stops.json work_time_s), at the xEMU
// design average metabolic rate. The walking time alone keeps the old meaning of the leg time.
const LEG_WALK = routeModel('suit model: walking speed at constant effort, no stops', SUIT_O2);
const LEG_WORK = sim('work time at the stops: our estimate per stop in stops.json (work_time_s), 1.5 times longer for a solo crew');
const LEG_WORK_USE = { ...suitModel('work at the stops: the stops.json work time at the xEMU design average metabolic rate', ['suit.metabolic.design_average', 'suit.o2.primary_usable', ...SUIT_BATTERY]), tag: 'SIM' };
const LEG_FIELDS = {
  distanceM: LEG_TERRAIN, climbM: LEG_TERRAIN, descentM: LEG_TERRAIN, maxSlopeDeg: LEG_TERRAIN,
  timeSec: LEG_TIME, o2G: LEG_O2, o2Pct: LEG_O2, batteryWh: LEG_BATTERY, batteryPct: LEG_BATTERY,
  walkSec: LEG_WALK, workSec: LEG_WORK, workO2G: LEG_WORK_USE, workBatteryWh: LEG_WORK_USE,
};
const TOTAL_FIELDS = {
  ...LEG_FIELDS,
  returnTimeSec: LEG_TIME, returnO2G: LEG_MARGIN, returnBatteryWh: LEG_BATTERY,
  arrivalO2G: LEG_MARGIN, arrivalO2Pct: LEG_MARGIN, arrivalBatteryWh: LEG_BATTERY, arrivalBatteryPct: LEG_BATTERY,
  marginSec: LEG_MARGIN, status: LEG_MARGIN,
};
const prefixed = (prefix, fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [prefix + k, v]));

const MEDA = { tag: 'DATA', label: 'MEDA · Perseverance', short: 'MEDA · Perseverance' };
const RAD = { tag: 'DATA', label: 'RAD · Curiosity (Gale)', short: 'RAD · Curiosity', site: 'Gale crater, not Jezero' };

/**
 * Declared entries for every path a writer puts in the store's `sources` map (docs/STATE_AND_ENGINE.md).
 * `from` names the data that fills the entry once the files load: a MEDA channel, the RAD background,
 * hazards.json value ids or a credits.json entry. SIM values need no file.
 */
export const STORE_PATHS = Object.freeze({
  // mission clock (src/sim/missionClock.js)
  'mission.startedAtMs': sim('demo mission epoch chosen by us, not a historical date'),
  'mission.initialSol': sim('demo mission epoch chosen by us, not a historical date'),
  'mission.initialLmst': sim('demo mission epoch chosen by us, not a historical date'),
  'mission.sky': sim('sky preset chosen for the demo'),
  'mission.anchorMs': { tag: 'DERIVED', source: 'mission clock: wall time the elapsed time counts from' },
  'mission.elapsedSec': { tag: 'DERIVED', source: 'mission clock: time since the mission start' },
  'mission.sol': { tag: 'DERIVED', source: 'mission clock: one sol = 88,775 Earth s from the demo epoch' },
  'mission.lmst': { tag: 'DERIVED', source: 'mission clock: local mean solar time at 77.3053 E, not a precise ephemeris' },
  'mission.timeScale': sim('demo time-scale factor'),
  'mission.paused': sim('pause set by the player'),

  // suit model (src/sim/suitModel.js)
  'suit.oxygenG': suitModel('suit model: xEMU primary O2 minus walking use', SUIT_O2),
  'suit.oxygenSec': suitModel('suit model: O2 left over the current O2 rate', SUIT_O2),
  'suit.oxygenPct': suitModel('suit model: xEMU primary O2 minus walking use', SUIT_O2),
  'suit.batteryPct': suitModel('suit model: xEMU battery, the effort share of the draw is SIM', SUIT_BATTERY),
  'suit.pressurePsi': { tag: 'DATA', label: 'xEVA con ops · NASA', source: 'xEVA nominal suit pressure', from: { hazards: ['suit.pressure.nominal'] } },
  'suit.metabolicW': suitModel('suit model: metabolic power from speed and slope (Minetti et al. 2002)', SUIT_O2),
  'suit.effort': suitModel('suit model: metabolic power between rest and design peak', [...SUIT_O2, 'suit.metabolic.design_peak']),
  'suit.walkbackSec': suitModel('suit model: route home at constant effort (SIM rule)', SUIT_O2),
  'suit.walkbackO2G': suitModel('suit model: O2 for the route home with the 20 % pad', SUIT_MARGIN),
  'suit.marginSec': suitModel('suit model: Apollo 30 min reserve + 20 % pad; thresholds SIM', SUIT_MARGIN),
  'suit.status': suitModel('suit model: margin against the caution and warning thresholds (SIM)', SUIT_MARGIN),

  // partner (src/sim/partnerRunner.js, #70): the same suit model as the player, fed by the partner's movement
  'crew.0.rangeM': sim('range from the player to the partner source position; no GPS on Mars'),
  'crew.0.bearingDeg': sim('bearing from the player to the partner source position; no GPS on Mars'),
  'crew.0.oxygenPct': suitModel('suit model fed by the partner\'s movement: xEMU primary O2 minus walking use', SUIT_O2),
  'crew.0.batteryPct': suitModel('suit model fed by the partner\'s movement: xEMU battery, the effort share of the draw is SIM', SUIT_BATTERY),
  'crew.0.status': suitModel('partner suit margin against the caution and warning thresholds (SIM)', SUIT_MARGIN),
  'crew.0.link': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'radio line of sight between the two suits on the HiRISE height map', from: HIRISE },
  'crew.0.separationLimitM': sim('our rule: 100 m from the pair-walk mockup, caution from 80 m; hazards.json has no separation value'),

  // navigation (#42): trueX/trueZ is the simulated truth from the engine, x/z the estimate the drift model shows
  'navigation.x': sim('simulated position estimate: true position plus the drift offset (src/sim/navigationDrift.js)'),
  'navigation.z': sim('simulated position estimate: true position plus the drift offset (src/sim/navigationDrift.js)'),
  'navigation.trueX': sim('simulated true position from the engine (src/state/engineBridge.js); the HUD never shows it'),
  'navigation.trueZ': sim('simulated true position from the engine (src/state/engineBridge.js); the HUD never shows it'),
  'navigation.headingDeg': sim('player heading from the engine'),
  'navigation.slopeDeg': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'slope of the HiRISE height map under the player', from: HIRISE },
  'navigation.errorM': sim('navigation error model: dead reckoning, terrain fixes and radio ranging (src/sim/navigationDrift.js)'),
  'navigation.fixMode': sim('navigation fix model: terrain fix, dead reckoning or radio ranging (src/sim/navigationDrift.js)'),
  'navigation.lastFixSec': sim('mission time of the last terrain fix (src/sim/navigationDrift.js)'),
  'navigation.waypointRangeM': sim('distance from the player position to the next waypoint or shelter (src/sim/waypointRunner.js)'),
  'navigation.waypointBearingDeg': sim('bearing from the player position to the next waypoint or shelter (src/sim/waypointRunner.js)'),

  // route: planner, re-planner and per-leg costs (src/sim/legCosts.js)
  'route.waypoints': sim('waypoints of route.json, chosen by the team along the Perseverance traverse'),
  'route.path': PLANNER,
  'route.distanceM': PLANNER,
  'route.climbM': PLANNER,
  'route.steepestSlopeDeg': PLANNER,
  'route.etaSec': suitModel('route distance at the walking speed of the suit model', SUIT_O2),
  'route.nextIndex': sim('first waypoint not visited yet'),
  'route.visited': sim('waypoints already reached in Walk mode'),
  'route.reason': sim('why the re-planner changed the route'),
  'route.shelter': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'shelters.json: sky view ray cast on the HiRISE height grid', from: HIRISE },
  'route.decision': sim('go or no-go chosen by the crew'),
  'route.skipped': sim('waypoints the event route leaves out'),
  // route profiles compared on the mission table (#245, src/sim/routeProfiles.js); time and oxygen as route.totals
  'route.profile': sim('route profile chosen by the crew at the mission table'),
  'route.profiles.distanceM': PLANNER,
  'route.profiles.steepestSlopeDeg': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'slope of the HiRISE height map, sampled every metre along the route', from: HIRISE },
  'route.profiles.overCautionM': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'route length on HiRISE slopes over the 15 degree caution limit', from: HIRISE },
  'route.profiles.shadowShare': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'line of sight on the HiRISE height map from the suit to the habitat mast', from: HIRISE },
  'route.profiles.weights': sim('profile weights are our choice: slope cubed for the gentlest, three times the cost out of sight of the mast for radio contact'),
  'route.profiles.timeSec': LEG_TIME,
  'route.profiles.o2G': LEG_O2,
  // the route from the crew's needs (src/sim/missionNeeds.js): stops, budget and reasons rest on our work times, rules
  // and risk settings (SIM); the per-leg explanation is the planner on the HiRISE height map (#246)
  'route.stops': sim('stops chosen from stops.json by the objective, then kept while the plan fits the time, O2 and battery'),
  'route.dropped': sim('optional stops left out: with them the plan goes over the time less the reserve, under the O2 margin floor or under the battery reserve'),
  'route.planReasons': sim('why the plan is what it is: the crew rules, the risk setting and each stop added or dropped'),
  'route.weights': sim('risk setting: slope penalty, rock weight, rover-ground discount and reserve are our choice; the 20 degree limit is NASA\'s suited walking limit and never moves'),
  'route.budget': sim('time available set by the crew, less the risk reserve; the walk out, the work at the stops and the walk home from the suit model'),
  'route.budget.usedSec': LEG_TIME,
  'route.budget.marginSec': LEG_MARGIN,
  'route.explain': { ...PLANNER, source: 'straight line between the ends of each leg, tested on the HiRISE height map against the 20 degree limit like the planner' },
  'route.explain.extraM': { ...PLANNER, source: 'planned leg length on the HiRISE height map minus its straight line' },
  'route.explain.extraSec': LEG_WALK,
  // the needs the crew sets at the mission table (#265): inputs, not measurements
  'needs.objective': sim('objective chosen by the crew at the mission table'),
  'needs.crew': sim('crew size chosen at the mission table: a solo astronaut stays in radio contact and works 1.5 times as long'),
  'needs.timeMin': sim('time available for the EVA, set by the crew'),
  'needs.o2Pct': sim('suit O2 at the start, set by the crew as a share of the xEMU primary tank'),
  'needs.batteryPct': sim('suit battery at the start, set by the crew as a share of the xEMU battery'),
  'needs.risk': sim('risk tolerance chosen by the crew: slope penalty, rock weight, reserve and rover-ground preference'),
  // sampling tasks of the "Collect samples" goal (#352, src/sim/sampleTasks.js)
  'needs.tasks': sim('sampling tasks set by the crew: what to collect (a photo record, a soil or a rock sample), where (a stop of stops.json or a point on the map) and how many'),
  'route.tasks': sim('sampling tasks routed by the planner: each place inserted where it adds the least walking; the first task always kept, each later one kept while the plan still fits the time, O2 and battery'),
  'tasks.workSec': sim(`work per item for a pair of astronauts, our estimate, 1.5 times longer for a solo crew; planned time, not played in real time. ${Object.values(TASK_WORK_NOTES).join(' ')}`),
  'tasks.place': { tag: 'DERIVED', label: 'HiRISE DTM', source: 'a clicked point snapped to ground under 20 degrees and reachable from the airlock on the HiRISE cost grid', from: HIRISE },
  'eva.tasks': sim('samples secured and photos taken within the place\'s arrival radius plus 2 m (the scoop\'s reach) count for a task; a sample of the right type secured elsewhere counts as done elsewhere, a photo taken elsewhere does not count'),
  ...prefixed('route.legs.', LEG_FIELDS),
  ...prefixed('route.totals.', TOTAL_FIELDS),

  // Perseverance on the mission table map (#249, public/data/traverse.json from scripts/build-traverse.mjs). Not store
  // values: the map shows them as fixed tags. An image pin passes its own tag, DERIVED when the position is deduced.
  'map.traverse': {
    tag: 'DATA', label: 'Mars 2020 traverse · MMGIS', short: 'Mars 2020 · MMGIS',
    source: "Perseverance's drives across the tile, from the MMGIS traverse of the Mars 2020 Where is the rover map",
    from: { credits: 'm2020-rover-waypoint' },
  },
  'map.imagePins': {
    tag: 'DATA', label: 'Mars 2020 waypoints · MMGIS', short: 'Mars 2020 · MMGIS',
    source: 'where the rover stood for each image: the site and drive in the image ID, or its stop on the image sol (MMGIS waypoints)',
    from: { credits: 'm2020-rover-waypoint' },
  },

  // EVA history and debrief (#43): the frozen summary copied from the store when the astronaut re-entered the HAB
  'eva.distanceM': { tag: 'DERIVED', source: 'sum of horizontal steps between navigation readings in Walk mode while the mission ran' },
  'eva.elapsedOutsideSec': { tag: 'DERIVED', source: 'mission clock time between leaving and re-entering the habitat arrival area' },
  'eva.sampleCount': sim('samples secured in a container this EVA (engine sampling bridge)'),

  // environment: MEDA replay, RAD curve and the dust event
  'environment.pressurePa': { ...MEDA, source: 'MEDA pressure, replayed sol', from: { meda: 'pressure' } },
  'environment.tempC': { ...MEDA, source: 'MEDA air temperature, replayed sol', from: { meda: 'air_temperature' } },
  'environment.windMs': { ...MEDA, source: 'MEDA wind speed, replayed sol', from: { meda: 'wind_speed' } },
  'environment.windDirDeg': { ...MEDA, source: 'MEDA wind direction, replayed sol', from: { meda: 'wind_direction' } },
  'environment.rhPct': { ...MEDA, source: 'MEDA relative humidity, replayed sol', from: { meda: 'relative_humidity' } },
  'environment.doseRateUgyH': { ...RAD, source: 'RAD surface dose rate', from: { rad: 'background' } },
  'environment.doseUgy': { ...RAD, tag: 'DERIVED', source: 'dose this EVA: the RAD dose rate summed over mission time', from: { rad: 'background' } },
  // The dust storm event (src/sim/events/dust-storm.json) ramps tau from the Jezero clear season (0.45, Perseverance)
  // to the 2018 global storm Curiosity measured in Gale crater (8.0). The ramp shape and timing are ours, so the
  // values in between are DERIVED. The event banner prints `caption` next to this tag (#196).
  'environment.dustOpacity': {
    tag: 'DERIVED', label: 'Dust storm model', short: 'Dust storm model',
    source: 'dust storm event: tau from the Jezero clear season 0.45 up to the 2018 global storm 8.0 in Gale crater, not Jezero; a worst case, and the ramp timing is SIM',
    caption: 'global storm worst case · up to Curiosity\'s Gale 2018 storm, not Jezero',
    from: { hazards: ['dust.tau.gale_global_storm_2018', 'dust.tau.clear_season', 'dust.event.ramp_duration'] },
  },
  // The radiation event (src/sim/events/radiation.json) plays the September 2017 solar particle event from
  // hazards.json models.sep_2017_profile, not the background rate above. The event banner shows this entry (#196).
  'events.radiation.doseRateUgyH': {
    tag: 'DATA', label: 'RAD · Curiosity (Gale)', short: 'RAD · Curiosity',
    source: 'radiation event: RAD B dose rate of the September 2017 solar particle event, hazards.json models.sep_2017_profile; the 12 min timeline is SIM',
    caption: 'September 2017 solar particle event · RAD · Curiosity · Gale crater, not Jezero',
    from: { hazards: ['model:sep_2017_profile'] },
  },
});

const FIELDS = ['tag', 'label', 'short', 'source', 'caption', 'mission', 'instrument', 'site', 'solOrDate', 'reference', 'link', 'dataLink', 'note'];

function checkEntry(path, entry) {
  if (typeof path !== 'string' || !path) throw new Error('provenance path must be a non-empty string');
  if (!entry || !TAGS.includes(entry.tag)) throw new Error(`provenance ${path}: tag must be DATA, DERIVED or SIM`);
}

function clean(path, entry) {
  const out = { path };
  for (const k of FIELDS) out[k] = entry[k] ?? null;
  out.label ??= out.tag;
  out.short ??= out.label;
  return Object.freeze(out);
}

/** Fields taken from one provenance block (public/data/README.md). */
function fromBlock(p) {
  return {
    mission: p.mission, instrument: p.instrument, site: p.site, solOrDate: p.sol_or_date,
    reference: p.reference, link: p.url, dataLink: p.data_url,
  };
}

const unique = (xs) => [...new Set(xs.filter(Boolean))];

/** Data fields for one declaration, or null when its file did not load. */
function dataFor(spec, files) {
  const from = spec.from;
  if (!from) return null;
  if (from.meda && files.meda) {
    const ch = files.meda.channels[from.meda];
    if (!ch) return null;
    const p = ch.ch.provenance;
    return { ...fromBlock(p), label: ch.label, short: hudLabel(p) };
  }
  if (from.rad && files.rad) {
    const p = files.rad.background.provenance;
    return { ...fromBlock(p), label: hudLabel(p), short: hudLabel(p, { site: false }) };
  }
  if (from.hazards && files.hazards) {
    const h = files.hazards;
    const values = from.hazards.map((id) => (id.startsWith('model:') ? h.models?.[id.slice(6)] : h.values?.[id])).filter((v) => v?.provenance);
    if (values.length === 0) return null;
    const blocks = values.map((v) => v.provenance);
    const measured = values.filter((v) => v.tag !== 'SIM');
    const first = (measured[0] ?? values[0]).provenance;
    if (values.length === 1) return { ...fromBlock(first), label: values[0].label };
    return {
      ...fromBlock(first),
      mission: unique(blocks.map((b) => b.mission)).join(', ') || null,
      instrument: unique(blocks.map((b) => b.instrument)).join(', ') || null,
      site: unique(blocks.map((b) => b.site)).join('; ') || null,
      solOrDate: unique(blocks.map((b) => b.sol_or_date)).join('; ') || null,
      reference: unique(values.map((v) => v.label)).join('; '),
    };
  }
  if (from.credits && files.credits) {
    const c = files.credits.entries?.find((e) => e.id === from.credits);
    if (!c) return null;
    return { mission: c.mission, instrument: c.instrument, site: 'Jezero crater', reference: c.citation, link: c.url, dataLink: c.data_urls?.[0] ?? null };
  }
  return null;
}

const defaultDev = () => import.meta.env?.DEV === true;

/**
 * @param {{ dev?: boolean, warn?: (...args: unknown[]) => void, entries?: Record<string, object> }} [options]
 *   dev: log a warning for a path with no entry (default: Vite's import.meta.env.DEV)
 */
export function createProvenanceRegistry({ dev = defaultDev(), warn = (...a) => console.warn(...a), entries: initial = {} } = {}) {
  const specs = new Map();
  const entries = new Map();
  const warned = new Set();
  const listeners = new Set();
  let files = {};
  let version = 0;

  const build = (path) => {
    const spec = specs.get(path);
    entries.set(path, clean(path, { ...spec, ...dataFor(spec, files), tag: spec.tag, source: spec.source }));
  };
  const notify = () => { version++; for (const l of listeners) l(); };

  const registry = {
    /** Declare entries in code, for example SIM values. Overrides an earlier entry for the same path. */
    define(map) {
      for (const [path, spec] of Object.entries(map)) { checkEntry(path, spec); specs.set(path, spec); build(path); }
      notify();
      return registry;
    },
    /**
     * Fill entries from parsed data files. Pass what loaded; missing files leave the declared fields.
     * @param {{ hazards?: object, meda?: object, rad?: object, credits?: object }} data raw JSON
     */
    loadData(data) {
      const next = { ...files };
      const parsers = { hazards: (j) => j, credits: (j) => j, meda: parseMedaSol, rad: parseRad };
      for (const [k, parse] of Object.entries(parsers)) {
        if (!data[k]) continue;
        try { next[k] = parse(data[k]); } catch (e) { warn(`[provenance] ${k} not used:`, e.message); }
      }
      files = next;
      for (const path of specs.keys()) build(path);
      notify();
      return registry;
    },
    has: (path) => entries.has(path),
    paths: () => [...entries.keys()],
    /** The registry entry alone, or null. No warning. */
    lookup: (path) => entries.get(path) ?? null,
    /**
     * The entry to show for a value: the registry entry with the live store entry on top.
     * Warns once per path in development when the registry has no entry.
     * @param {string} path store path such as 'environment.tempC'
     * @param {{ tag?: string, label?: string, source?: string } | null} [live] the store's sources[path]
     */
    resolve(path, live = null) {
      const entry = entries.get(path);
      if (!entry && dev && !warned.has(path)) {
        warned.add(path);
        warn(`[provenance] no registry entry for "${path}". Declare it in src/data/provenance.js (plan section 4.1).`);
      }
      if (!live || !TAGS.includes(live.tag)) return entry ?? null;
      if (!entry) return clean(path, live);
      // A store label means the writer built it from the same provenance (MEDA "sol 1187"): keep the details.
      if (live.label || live.tag === entry.tag) {
        return clean(path, { ...entry, tag: live.tag, label: live.label ?? entry.label, source: live.source ?? entry.source });
      }
      // Another tag with no label, for example the ?mock=1 values: show only what the writer says.
      return clean(path, { tag: live.tag, source: live.source, note: `Registry entry: ${entry.tag}, ${entry.source ?? entry.label}` });
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getVersion: () => version,
  };
  registry.define(initial);
  return registry;
}

/** Detail lines for the tooltip, in reading order, as [label, value, href?]. Empty fields are left out. */
export function describeEntry(entry) {
  if (!entry) return [];
  const lines = [
    ['Tag', `${entry.tag}: ${translateText(TAG_MEANING[entry.tag])}`],
    ['Value', entry.source],
    ['Mission', entry.mission],
    ['Instrument', entry.instrument],
    ['Site', entry.site],
    ['Sol or date', entry.solOrDate],
    ['Reference', entry.reference, entry.link],
    ['Data', entry.dataLink ? 'archive' : null, entry.dataLink],
    ['Note', entry.note],
  ];
  return lines.filter(([, v]) => v).map(([label, value, href]) => [translateText(label), value, href]);
}

/** One sentence for screen readers: "Source: MEDA · Perseverance · sol 1187, DATA. Mission Mars 2020. ..." */
export function textAlternative(entry) {
  if (!entry) return '';
  const parts = [t('ui.source.label', { label: entry.label === entry.tag ? entry.tag : `${entry.label}, ${entry.tag}` })];
  for (const [k, v] of describeEntry(entry).slice(1)) if (k !== translateText('Data')) parts.push(`${k} ${v}`);
  return parts.join('. ') + '.';
}

/** The app's registry, with every store path declared. src/main.jsx loads the data files into it. */
export const provenance = createProvenanceRegistry({ entries: STORE_PATHS });

/**
 * Fetch the data files and fill the registry. A file that fails keeps its declared entries and logs a warning.
 * Without `fetchFn` the files come from the shared loader (src/data/dataFiles.js), one request per file per page.
 * @param {{ registry?: ReturnType<typeof createProvenanceRegistry>, fetchFn?: typeof fetch, base?: string }} [options]
 */
export async function loadProvenance({ registry = provenance, fetchFn, base = import.meta.env?.BASE_URL ?? '/' } = {}) {
  const files = { hazards: HAZARDS_PATH, meda: MEDA_SOL_PATH, rad: RAD_PATH, credits: CREDITS_PATH };
  const keys = Object.keys(files);
  const results = await Promise.allSettled(keys.map(async (k) => {
    if (!fetchFn) return loadDataFile(files[k], base);
    const r = await fetchFn(base + files[k]);
    if (!r.ok) throw new Error(`${files[k]} ${r.status}`);
    return r.json();
  }));
  const data = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') data[keys[i]] = r.value;
    else console.warn('[provenance] not loaded:', r.reason);
  });
  registry.loadData(data);
  return registry;
}
