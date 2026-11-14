// Build public/data/rad.json from the MSL RAD archive and hazards.json.
//
// Usage: npm run rad              (downloads are cached in node_modules/.cache/pds)
//        npm run rad -- --refresh (download again)
//
// 1. Copies the background dose rates from hazards.json unchanged, so both
//    files always agree. #18 sourced them.
// 2. Reads the September 2017 solar particle event from the RAD Reduced Data
//    Records (MSL-M-RAD-3-RDR-V1.0, PDS PPI node). Each sol file is about
//    80 MB, so the script reads each detached label (about 1.5 MB), takes the
//    byte offsets of every observation from it, and downloads only the
//    observation header and the two total dose lines with HTTP range requests
//    (about 20 kB per observation, about 30 MB in all).
// 3. Finds the event onset in the archive itself and puts the curve on a time
//    axis in minutes from that onset. The onset maps to the onset time that
//    hazards.json uses (radiation.sep_2017.onset_at_mars). The archive's own
//    UTC stamps run about 4 h 50 min early for these sols, so they are kept for
//    reference only. docs/data/meda-rad-notes.md explains the check.
// 4. Compares the archive with Zeitlin et al. 2018 Table 1 as recorded in
//    hazards.json and writes the comparison into the file.
//
// The output depends only on the pinned products and hazards.json, so a rerun
// writes the same bytes.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchText, mapLimit, sha256, stringifyCompact } from './pdsFetch.mjs';
import { hudLabel } from '../src/data/medaRad.js';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const OUT = 'public/data/rad.json';
const hazards = JSON.parse(readFileSync(root('public/data/hazards.json'), 'utf8')).values;

const ARCHIVE = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/';
const DATA_DIR = `${ARCHIVE}DATA/SOL_01773_01869/`;
const SIS_URL = `${ARCHIVE}DOCUMENT/RAD_RDR_SIS.HTM`;

/** One RDR product per MSL sol. Sols 1807-1819 cover 5 days before the onset through 5 days after the shock. */
const PRODUCTS = [
  'RAD_RDR_2017_248_00_40_1807_V00', 'RAD_RDR_2017_249_01_38_1808_V00', 'RAD_RDR_2017_250_02_13_1809_V00',
  'RAD_RDR_2017_251_02_40_1810_V00', 'RAD_RDR_2017_252_03_24_1811_V00', 'RAD_RDR_2017_253_04_24_1812_V00',
  'RAD_RDR_2017_254_04_42_1813_V00', 'RAD_RDR_2017_255_05_28_1814_V00', 'RAD_RDR_2017_256_06_11_1815_V00',
  'RAD_RDR_2017_257_06_41_1816_V00', 'RAD_RDR_2017_258_07_23_1817_V00', 'RAD_RDR_2017_259_08_10_1818_V00',
  'RAD_RDR_2017_260_08_45_1819_V00',
];

/** Rules for the curve. Each one is explained in docs/data/meda-rad-notes.md. */
const RULES = {
  /** Only observations the archive marks "no quality control issues" (QC=00000000, RDR SIS 4.2.1.2). */
  qc: '00000000',
  /** Baseline for the onset test: these archive-time days before the event sol. */
  baselineStart: '2017-09-05T00:00:00Z',
  baselineEnd: '2017-09-10T00:00:00Z',
  /** Onset: the first observation that starts a run of this many E rates above baseline + sigmas x SD. */
  onsetSigmas: 3,
  onsetRun: 4,
  /** Curve window around the onset, minutes. */
  windowStartMin: -24 * 60,
  windowEndMin: 72 * 60,
  /** Days for the before and after means, as in Zeitlin et al. 2018 Table 1. */
  meanDays: 5,
};

/** Margin before an observation's first data pointer, to catch its [OBSERVATION: NN] header. Bytes. */
const HEADER_MARGIN = 2048;
const MIN_MS = 60_000;

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

function parseUtc(doyTime) {
  // "2017-253 04:24:11" -> ms
  const m = /^(\d{4})-(\d{3}) (\d{2}):(\d{2}):(\d{2})$/.exec(doyTime.trim());
  if (!m) throw new Error('bad RAD UTC time ' + doyTime);
  return Date.UTC(+m[1], 0, +m[2], +m[3], +m[4], +m[5]);
}

function parseIsoMinute(isoText) {
  // "2017-09-10T19:50Z" -> ms
  const ms = Date.parse(isoText.replace(/Z$/, ':00Z'));
  if (!Number.isFinite(ms)) throw new Error('bad ISO time ' + isoText);
  return ms;
}

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

function field(text, key) {
  const m = new RegExp(`^\\s*${key}\\s*=(.*)$`, 'm').exec(text);
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

/** Byte offsets per observation from a detached PDS3 label. PDS3 offsets are 1-based. */
function observationsFromLabel(lbl, product) {
  const obs = new Map();
  const re = /\^OBS(\d{3})_(\w+?)\s*=\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*<BYTES>\s*\)/g;
  for (let m; (m = re.exec(lbl)); ) {
    if (m[3] !== `${product}.TXT`) throw new Error(`label points to ${m[3]}, expected ${product}.TXT`);
    const n = +m[1];
    const o = obs.get(n) ?? { n, first: Infinity };
    const byte = +m[4] - 1;
    o.first = Math.min(o.first, byte);
    if (m[2] === 'TOT_DOSE_B_ELEMENT') o.doseB = byte;
    if (m[2] === 'TOT_DOSE_E_ELEMENT') o.doseE = byte;
    obs.set(n, o);
  }
  return [...obs.values()].filter((o) => o.doseB !== undefined && o.doseE !== undefined);
}

function parseObservation(text, n) {
  const nn = String(n).padStart(2, '0');
  const at = text.lastIndexOf(`[OBSERVATION: ${nn}]`);
  if (at < 0) throw new Error(`observation ${nn} header not found`);
  const end = text.indexOf('[COUNTERS', at);
  const head = text.slice(at, end > 0 ? end : at + 1000);
  const dose = (det) => {
    const m = new RegExp(`\\[DOSIMETRY_TOTAL_DOSE_${det}: ${nn}\\]\\s+(-?[\\d.]+)`).exec(text);
    if (!m) throw new Error(`dose ${det} not found for observation ${nn}`);
    return +m[1];
  };
  return {
    startUtc: field(head, 'START_OBS_UTC'),
    durationS: +field(head, 'OBS_DURATION'),
    qc: field(head, 'QC'),
    doseB: dose('B'),
    doseE: dose('E'),
  };
}

async function readProduct(product) {
  const lbl = await fetchText(`${DATA_DIR}${product}.LBL`);
  if (field(lbl, 'PRODUCT_ID') !== product) throw new Error('product id mismatch in ' + product);
  const list = observationsFromLabel(lbl, product);
  const rows = await mapLimit(list, 6, async (o) => {
    const text = await fetchText(`${DATA_DIR}${product}.TXT`, [Math.max(0, o.first - HEADER_MARGIN), o.doseE + 64]);
    return { product, obs: o.n, ...parseObservation(text, o.n) };
  });
  return { product, label_sha256: sha256(lbl), observations: rows.length, rows };
}

const products = [];
for (const p of PRODUCTS) {
  const r = await readProduct(p);
  console.log(`${p}: ${r.observations} observations`);
  products.push(r);
}

const all = products.flatMap((p) => p.rows).map((r) => {
  const startMs = parseUtc(r.startUtc);
  return { ...r, startMs, midMs: startMs + (r.durationS * 1000) / 2 };
});
all.sort((a, b) => a.midMs - b.midMs || a.product.localeCompare(b.product) || a.obs - b.obs);
const clean = all.filter((r) => r.qc === RULES.qc && r.durationS > 0);

// Onset in archive time, from the E detector (the larger, less noisy one).
const meanOf = (rs, k) => rs.reduce((s, r) => s + r[k], 0) / rs.length;
const baseline = clean.filter((r) => r.midMs >= Date.parse(RULES.baselineStart) && r.midMs < Date.parse(RULES.baselineEnd));
const baseE = meanOf(baseline, 'doseE');
const sdE = Math.sqrt(baseline.reduce((s, r) => s + (r.doseE - baseE) ** 2, 0) / (baseline.length - 1));
const threshold = baseE + RULES.onsetSigmas * sdE;
const onsetIdx = clean.findIndex((r, i) =>
  r.midMs >= Date.parse(RULES.baselineEnd) &&
  i + RULES.onsetRun <= clean.length &&
  clean.slice(i, i + RULES.onsetRun).every((x) => x.doseE > threshold));
if (onsetIdx < 0) throw new Error('no onset found');
const onsetArchiveMs = clean[onsetIdx].startMs;

const hazOnset = hazards['radiation.sep_2017.onset_at_mars'];
const hazFlare = hazards['radiation.sep_2017.flare'];
const hazLead = hazards['radiation.sep_2017.warning_lead_time'];
const hazDuration = hazards['radiation.sep_2017.duration'];
if (!/57 h 10 min/.test(hazDuration.provenance.note)) throw new Error('hazards duration note changed, recheck the shock time');
const onsetUtcMs = parseIsoMinute(hazOnset.value);
const archiveOffsetMin = round((onsetUtcMs - onsetArchiveMs) / MIN_MS, 1);
const tMin = (archiveMs) => (archiveMs - onsetArchiveMs) / MIN_MS;
const shockMin = 57 * 60 + 10;

// Curve window.
const curve = clean.filter((r) => tMin(r.midMs) >= RULES.windowStartMin && tMin(r.midMs) <= RULES.windowEndMin);

// Comparison with Zeitlin et al. 2018 Table 1 (as recorded in hazards.json), in µGy/day.
const perDay = (x) => round(x * 24, 1);
const before = clean.filter((r) => tMin(r.midMs) >= -RULES.meanDays * 1440 && tMin(r.midMs) < 0);
const during = clean.filter((r) => tMin(r.midMs) >= 0 && tMin(r.midMs) < shockMin);
const after = clean.filter((r) => tMin(r.midMs) >= shockMin && tMin(r.midMs) < shockMin + RULES.meanDays * 1440);
const peakOf = (k) => during.reduce((best, r) => (r[k] > best[k] ? r : best));
const peakB = peakOf('doseB');
const peakE = peakOf('doseE');
// Event dose above the before-event mean: trapezoid rule over the observation midpoints from
// the onset to the shock. The record has gaps, so summing rate x observation length would undercount.
const eventDose = (k) => {
  const base = meanOf(before, k);
  const pts = clean.map((r) => [tMin(r.midMs), r[k] - base]);
  const at = (x) => {
    const i = pts.findIndex((p) => p[0] >= x);
    const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
    return v0 + ((x - t0) / (t1 - t0)) * (v1 - v0);
  };
  const inside = pts.filter((p) => p[0] > 0 && p[0] < shockMin);
  const line = [[0, at(0)], ...inside, [shockMin, at(shockMin)]];
  let sum = 0;
  for (let i = 1; i < line.length; i++) sum += ((line[i][1] + line[i - 1][1]) / 2) * ((line[i][0] - line[i - 1][0]) / 60);
  return round(sum, 0);
};

// Guard the E values quoted from hazards.json notes, so a change there fails loudly instead of drifting.
const PUBLISHED_E = { before: 265, peak: 588, eventDose: 369 };
if (!/read 265/.test(hazards['radiation.sep_2017.dose_rate_before'].provenance.note)) throw new Error('hazards E before value changed');
if (!/peaked at 588/.test(hazards['radiation.sep_2017.dose_rate_peak'].provenance.note)) throw new Error('hazards E peak value changed');
if (!/369 µGy/.test(hazards['radiation.sep_2017.event_dose'].provenance.locator)) throw new Error('hazards E event dose changed');

const RAD_PROVENANCE = {
  mission: 'MSL',
  instrument: 'RAD',
  product_id: `MSL-M-RAD-3-RDR-V1.0: ${PRODUCTS[0]} to ${PRODUCTS.at(-1)} (MSL sols 1807-1819), DOSIMETRY_TOTAL_DOSE_B and DOSIMETRY_TOTAL_DOSE_E per observation`,
  site: 'Gale crater, not Jezero',
  sol_or_date: 'MSL sols 1807-1819, 2017-09-05 to 2017-09-18; event 2017-09-10 to 2017-09-13',
  reference: 'MSL RAD Reduced Data Record (MSL-M-RAD-3-RDR-V1.0), NASA Planetary Data System, PPI node; event timing from Zeitlin et al. 2018, Analysis of the Radiation Hazard Observed by RAD on the Surface of Mars During the September 2017 Solar Particle Event, Geophysical Research Letters 45, 5845-5851',
  url: 'https://doi.org/10.1029/2018GL077760',
  locator: 'RDR SIS section 4.2.1.6: total dose for the B and E detectors \'in microGray / hour\'; QC flag in section 4.2.1.2; onset time in Zeitlin section 3.1',
  data_url: DATA_DIR,
  license: 'RAD data in PDS are public with no restriction of use (NASA SPD-41A). Zeitlin et al. 2018 is cited for timing only.',
  note: 'Dose rate per RAD observation (481 s during the event, 961 s otherwise) as archived. Built by scripts/build-rad.mjs. Measured by Curiosity in Gale crater, not in Jezero.',
};

const label = (tag) => hudLabel(RAD_PROVENANCE, { tag });

const copyFromHazards = (id) => {
  const v = hazards[id];
  if (!v) throw new Error('hazards.json is missing ' + id);
  return structuredClone(v);
};

const out = {
  schema_version: 1,
  title: 'RAD background and September 2017 solar particle event',
  description: 'Background surface dose rates (copied from hazards.json) and the dose rate curve of the 10-13 September 2017 solar particle event measured by RAD on Curiosity, for the HUD (#20) and the radiation event (#25). Field definitions are in public/data/README.md.',
  historical_note: 'Every observation here is historical and was measured in Gale crater, not in Jezero. None of it describes current conditions on Mars.',
  generated_by: 'scripts/build-rad.mjs',
  values: {
    'radiation.background.absorbed_dose_rate': copyFromHazards('radiation.background.absorbed_dose_rate'),
    'radiation.background.dose_equivalent_rate': copyFromHazards('radiation.background.dose_equivalent_rate'),
  },
  event: {
    id: 'sep_2017',
    tag: 'DATA',
    label: label('DATA'),
    provenance: RAD_PROVENANCE,
    time_axis: {
      unit: 'min',
      meaning: 't_min is minutes from the event onset at Mars, at the middle of each RAD observation. Replay by interpolating linearly between points.',
      tag: 'DERIVED',
      onset_utc: hazOnset.value,
      onset_source: 'radiation.sep_2017.onset_at_mars in hazards.json (Zeitlin et al. 2018, section 3.1)',
      flare_peak_t_min: -hazLead.value,
      flare_source: `${hazFlare.provenance.product_id} (${hazFlare.value}); radiation.sep_2017.warning_lead_time in hazards.json`,
      shock_t_min: shockMin,
      shock_source: 'radiation.sep_2017.duration in hazards.json: onset to shock arrival 57 h 10 min',
      archive_onset_utc: iso(onsetArchiveMs),
      archive_offset_min: archiveOffsetMin,
      note: `t_min = 0 is the start of the first of ${RULES.onsetRun} consecutive clean observations whose E dose rate is above the ${RULES.meanDays}-day baseline (${perDay(baseE)} µGy/day) plus ${RULES.onsetSigmas} SD (${perDay(sdE)} µGy/day). In the archive's START_OBS_UTC that observation starts at ${iso(onsetArchiveMs)}, ${archiveOffsetMin} min before the published onset. Those stamps put the rise before the flare peak, which cannot happen, so this file does not use them for timing. Details in docs/data/meda-rad-notes.md.`,
    },
    t_min: curve.map((r) => round(tMin(r.midMs), 1)),
    duration_s: curve.map((r) => r.durationS),
    channels: {
      dose_rate_b: {
        unit: 'µGy/h',
        tag: 'DATA',
        label: label('DATA'),
        detector: 'B (silicon, 300 µm)',
        values: curve.map((r) => round(r.doseB, 3)),
        note: 'DOSIMETRY_TOTAL_DOSE_B as archived. The SIS gives the unit but not the absorbing material. Zeitlin et al. 2018 Table 1 quotes B in water, and those numbers differ from the archive (see checks).',
      },
      dose_rate_e: {
        unit: 'µGy/h',
        tag: 'DATA',
        label: label('DATA'),
        detector: 'E (plastic scintillator)',
        values: curve.map((r) => round(r.doseE, 3)),
        note: 'DOSIMETRY_TOTAL_DOSE_E as archived. Matches Zeitlin et al. 2018 Table 1 within 1 % (see checks).',
      },
    },
    baseline: {
      dose_rate_b: { value: round(meanOf(before, 'doseB'), 3), unit: 'µGy/h', tag: 'DERIVED' },
      dose_rate_e: { value: round(meanOf(before, 'doseE'), 3), unit: 'µGy/h', tag: 'DERIVED' },
      note: `Mean of the clean observations in the ${RULES.meanDays} days before the onset (${before.length} observations). Subtract it to get the event's excess over background.`,
    },
    checks: {
      tag: 'DERIVED',
      note: 'Archive values from the clean observations, next to the published numbers recorded in hazards.json (Zeitlin et al. 2018 Table 1 and section 3.1). Means are per observation. A mismatch is reported here, not corrected.',
      published_e_source: 'hazards.json notes: dose_rate_before \'The E detector ... read 265\'; dose_rate_peak \'The E detector peaked at 588 µGy/day\'; event_dose locator \'369 µGy of dose as measured by E\'',
      rows: [
        { id: 'rate_before', hazards_id: 'radiation.sep_2017.dose_rate_before', unit: 'µGy/day', published_b_water: hazards['radiation.sep_2017.dose_rate_before'].value, archive_b: perDay(meanOf(before, 'doseB')), published_e: PUBLISHED_E.before, archive_e: perDay(meanOf(before, 'doseE')) },
        { id: 'rate_peak', hazards_id: 'radiation.sep_2017.dose_rate_peak', unit: 'µGy/day', published_b_water: hazards['radiation.sep_2017.dose_rate_peak'].value, archive_b: perDay(peakB.doseB), published_e: PUBLISHED_E.peak, archive_e: perDay(peakE.doseE), archive_b_t_min: round(tMin(peakB.midMs), 1), archive_e_t_min: round(tMin(peakE.midMs), 1) },
        { id: 'rate_after', hazards_id: 'radiation.sep_2017.dose_rate_after', unit: 'µGy/day', published_b_water: hazards['radiation.sep_2017.dose_rate_after'].value, archive_b: perDay(meanOf(after, 'doseB')), published_e: null, archive_e: perDay(meanOf(after, 'doseE')) },
        { id: 'event_dose', hazards_id: 'radiation.sep_2017.event_dose', unit: 'µGy above the before-event mean, onset to shock', published_b_water: hazards['radiation.sep_2017.event_dose'].value, archive_b: eventDose('doseB'), published_e: PUBLISHED_E.eventDose, archive_e: eventDose('doseE') },
      ],
    },
    source_files: {
      sis_url: SIS_URL,
      observations_read: all.length,
      observations_clean: clean.length,
      observations_in_curve: curve.length,
      products: products.map((p) => ({ product_id: p.product, label_sha256: p.label_sha256, observations: p.observations })),
    },
  },
};

const text = stringifyCompact(out);
writeFileSync(root(OUT), text);
console.log(`wrote ${OUT}: ${curve.length} points, ${(Buffer.byteLength(text) / 1024).toFixed(1)} kB`);
console.log('onset in archive time', iso(onsetArchiveMs), 'offset to published onset', archiveOffsetMin, 'min');
for (const r of out.event.checks.rows) console.log(r.id, 'published B', r.published_b_water, 'archive B', r.archive_b, '| published E', r.published_e, 'archive E', r.archive_e);
