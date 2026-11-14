// Build public/data/meda_sol.json from the Mars 2020 MEDA archive.
//
// Usage: npm run meda              (downloads are cached in node_modules/.cache/pds)
//        npm run meda -- --refresh (download again)
//
// 1. Downloads one sol of MEDA pressure, air temperature and relative humidity
//    (sol 1187, at the Cheyava Falls site) and one sol of wind (sol 312), as
//    pinned below, with their PDS4 labels. About 20 MB.
// 2. Averages each channel into one-minute bins of local mean solar time.
// 3. Locates both sols on the NASA traverse waypoints, so the file says how far
//    each was measured from the scene origin.
// 4. Writes the series with one provenance block per channel.
//
// Why sol 1187 and why wind comes from another sol: docs/data/meda-rad-notes.md.
// The output depends only on the pinned products and the waypoint file, so a
// rerun writes the same bytes.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchText, sha256, stringifyCompact } from './pdsFetch.mjs';
import { hudLabel } from '../src/data/medaRad.js';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const OUT = 'public/data/meda_sol.json';

const BUNDLE = 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/';
const RELEASE_NOTES = `${BUNDLE}document/meda_release_notes.txt`;
const RDR_SIS = `${BUNDLE}document/meda_env_rdr_sis.pdf`;
const WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

/** Scene origin: Cheyava Falls, the first Perseverance waypoint of sol 1210 (docs/marswalk-assets/README.md). */
const ORIGIN_SOL = 1210;

/** Minimum samples (about 1 Hz) for a one-minute bin to count. Half a minute. */
const MIN_SAMPLES = 30;

const product = (collection, range, sol, name) => {
  const s = String(sol).padStart(4, '0');
  const file = `WE__${s}___________${name}`;
  return { sol, name, file, csv: `${BUNDLE}${collection}/${range}/sol_${s}/${file}.CSV`, xml: `${BUNDLE}${collection}/${range}/sol_${s}/${file}.xml` };
};

/** Pinned products. Highest version present in the archive on 2026-11-14 (release 16). */
const P = {
  ps: product('data_derived_env', 'sol_1140_1259', 1187, 'DER_PS__________________P01'),
  ats: product('data_calibrated_env', 'sol_1140_1259', 1187, 'CAL_ATS_________________P01'),
  rhs: product('data_derived_env', 'sol_1140_1259', 1187, 'DER_RHS_________________P01'),
  ws: product('data_derived_env', 'sol_0300_0419', 312, 'DER_WS__________________P02'),
};

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i] === '' || cells[i] === undefined ? null : cells[i]; });
    return row;
  });
}

/** "01187M13:45:07.250" -> { sol: 1187, sec: 49507.25 } */
function parseLmst(text) {
  const m = /^(\d{5})M(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text);
  if (!m) throw new Error('bad LMST ' + text);
  return { sol: +m[1], sec: +m[2] * 3600 + +m[3] * 60 + +m[4] };
}

function labelInfo(xml) {
  const get = (tag) => {
    const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml);
    if (!m) throw new Error('label has no ' + tag);
    return m[1].trim();
  };
  return {
    lid: get('logical_identifier'),
    vid: get('version_id'),
    title: get('title'),
    start_utc: get('start_date_time'),
    stop_utc: get('stop_date_time'),
    ls_start: +get('mars2020:start_solar_longitude'),
    ls_stop: +get('mars2020:stop_solar_longitude'),
  };
}

async function load(p) {
  const [csv, xml] = await Promise.all([fetchText(p.csv), fetchText(p.xml)]);
  const info = labelInfo(xml);
  const rows = parseCsv(csv);
  for (const r of rows) {
    const t = parseLmst(r.LMST);
    if (t.sol !== p.sol) throw new Error(`${p.file}: row from sol ${t.sol}`);
    r.sec = t.sec;
  }
  return { ...p, info, rows, csv_sha256: sha256(csv), csv_bytes: Buffer.byteLength(csv, 'latin1') };
}

/**
 * Average `pick(row)` into one-minute LMST bins. Returns Map(minute -> mean).
 * `combine` turns the list of picked values into the bin value (default mean).
 */
function bin(rows, pick, combine = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length) {
  const groups = new Map();
  for (const r of rows) {
    const v = pick(r);
    if (v == null || Number.isNaN(v)) continue;
    const minute = Math.floor(r.sec / 60);
    if (!groups.has(minute)) groups.set(minute, []);
    groups.get(minute).push(v);
  }
  const out = new Map();
  for (const [minute, xs] of groups) if (xs.length >= MIN_SAMPLES) out.set(minute, combine(xs));
  return out;
}

const num = (x) => (x == null ? null : +x);

/**
 * Physical limits per channel. The CSVs use 999999999 as an undeclared fill
 * value, and sol 1187 has one sample with RH 106332. Samples outside these
 * limits are dropped and counted in the channel note.
 */
const LIMITS = {
  pressure: [0, 2000],
  air_temperature: [100, 350],
  relative_humidity: [0, 100],
  wind_speed: [0, 60],
  wind_direction: [0, 360],
};
const rejected = Object.fromEntries(Object.keys(LIMITS).map((k) => [k, 0]));
const valid = (key, x) => {
  const v = num(x);
  if (v == null) return null;
  const [lo, hi] = LIMITS[key];
  if (v < lo || v > hi) { rejected[key]++; return null; }
  return v;
};
const dropNote = (key) => `Dropped ${rejected[key]} samples outside ${LIMITS[key][0]}-${LIMITS[key][1]} (fill value 999999999 or glitches).`;

/** Mean compass direction of unit vectors, degrees clockwise from north. */
const meanDirection = (degs) => {
  let s = 0, c = 0;
  for (const d of degs) { s += Math.sin((d * Math.PI) / 180); c += Math.cos((d * Math.PI) / 180); }
  return ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360;
};

function columns(maps, digits) {
  const minutes = [...new Set(Object.values(maps).flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const values = {};
  for (const [k, m] of Object.entries(maps)) values[k] = minutes.map((t) => (m.has(t) ? round(m.get(t), digits[k]) : null));
  return { minutes, values };
}

const stats = (xs) => {
  const v = xs.filter((x) => x != null);
  return { min: Math.min(...v), max: Math.max(...v), count: v.length };
};

// Waypoints: where the rover was on each sol.
// Distances use the waypoints' own easting and northing, in metres.
const waypoints = JSON.parse(await fetchText(WAYPOINTS)).features.map((f) => f.properties);
const originWp = waypoints.find((p) => +p.sol === ORIGIN_SOL);
const ORIGIN = { sol: ORIGIN_SOL, site: originWp.site, drive: originWp.drive, lat: +originWp.lat, lon: +originWp.lon, elev_geoid_m: round(+originWp.elev_geoid, 1) };
function nearWaypoints(sol) {
  const dist = (p) => Math.hypot(+p.easting - +originWp.easting, +p.northing - +originWp.northing);
  const before = waypoints.filter((p) => +p.sol <= sol).at(-1);
  const after = waypoints.find((p) => +p.sol >= sol);
  return [before, after].map((p) => ({ sol: +p.sol, site: p.site, drive: p.drive, lat: +p.lat, lon: +p.lon, elev_geoid_m: round(+p.elev_geoid, 1), distance_m: Math.round(dist(p)) }));
}

const ps = await load(P.ps);
const ats = await load(P.ats);
const rhs = await load(P.rhs);
const ws = await load(P.ws);

// Sol 1187: pressure (Pa), air temperature (K, mean of the three mast sensors), relative humidity.
const solA = columns({
  pressure: bin(ps.rows, (r) => valid('pressure', r.PRESSURE)),
  air_temperature: bin(ats.rows, (r) => {
    const xs = [r.ATS_LOCAL_TEMP1, r.ATS_LOCAL_TEMP2, r.ATS_LOCAL_TEMP3].map((x) => valid('air_temperature', x)).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }),
  relative_humidity: bin(rhs.rows, (r) => valid('relative_humidity', r.LOCAL_RELATIVE_HUMIDITY)),
}, { pressure: 1, air_temperature: 1, relative_humidity: 1 });

// Sol 312: wind speed (m/s) and direction (deg), rover standing still only.
const still = ws.rows.filter((r) => r.ROVER_STILL === '1');
const solB = columns({
  wind_speed: bin(still, (r) => valid('wind_speed', r.HORIZONTAL_WIND_SPEED)),
  wind_direction: bin(still, (r) => valid('wind_direction', r.WIND_DIRECTION), meanDirection),
}, { wind_speed: 1, wind_direction: 0 });

const wpA = nearWaypoints(1187);
const wpB = nearWaypoints(312);
const solDate = (info) => `${info.start_utc.slice(0, 10)} to ${info.stop_utc.slice(0, 10)} UTC, Ls ${info.ls_start.toFixed(1)}-${info.ls_stop.toFixed(1)}`;
const MY = { 1187: 'MY 37', 312: 'MY 36' };
const COMMON_LICENSE = 'MEDA data in PDS are public with no restriction of use (NASA SPD-41A).';
const REFERENCE = 'Rodriguez-Manfredi et al., Mars 2020 MEDA Bundle (urn:nasa:pds:mars2020_meda), NASA Planetary Data System, Atmospheres node';
const BUNDLE_DOI = 'https://doi.org/10.17189/1522849';

const siteA = `Jezero crater, Neretva Vallis at Cheyava Falls. Waypoints for sols ${wpA[0].sol} and ${wpA[1].sol} are ${wpA[0].distance_m} m and ${wpA[1].distance_m} m from the scene origin`;
const siteB = `Jezero crater floor, ${(wpB[0].distance_m / 1000).toFixed(2)} km from the scene origin and ${Math.round(ORIGIN.elev_geoid_m - wpB[0].elev_geoid_m)} m lower (waypoint sol ${wpB[0].sol}), not at Cheyava Falls`;

const prov = (p, instrument, column, extra) => ({
  mission: 'Mars 2020',
  instrument,
  product_id: `${p.file} (${p.info.lid}::${p.info.vid})`,
  site: p.sol === 1187 ? siteA : siteB,
  sol_or_date: `sol ${p.sol}, ${solDate(p.info)} (${MY[p.sol]})`,
  reference: REFERENCE,
  url: BUNDLE_DOI,
  locator: `${p.info.title}, column ${column}; units in ${RDR_SIS}`,
  data_url: p.csv,
  license: COMMON_LICENSE,
  note: extra,
});

const channel = (unit, provenance, sol, values, extra = {}) => ({
  unit,
  tag: 'DATA',
  label: hudLabel(provenance, { sol }),
  provenance,
  ...extra,
  stats: stats(values),
  values,
});

const pressureProv = prov(ps, 'MEDA PS', 'PRESSURE (pascal)',
  `One-minute means of the derived pressure, which the archive builds from barocap 3 (readme.txt). ${dropNote('pressure')} Bins with fewer than ${MIN_SAMPLES} samples are left out.`);
const tempProv = prov(ats, 'MEDA ATS', 'ATS_LOCAL_TEMP1-3 (kelvin)',
  `Mean of the three sensors on the remote sensing mast (ATS 1-3; ATS 4-5 sit on the rover body and are not used), then one-minute means. ATS has no derived level, so this is the calibrated level the readme recommends in that case. ${dropNote('air_temperature')} Bins with fewer than ${MIN_SAMPLES} samples are left out.`);
const rhProv = prov(rhs, 'MEDA HS', 'LOCAL_RELATIVE_HUMIDITY',
  `One-minute means. Relative to the sensor head temperature (HUMIDITY_LOCAL_TEMP), not to the air temperature. The SIS gives no unit for this column. The one-minute values on this sol run ${stats(solA.values.relative_humidity).min} to ${stats(solA.values.relative_humidity).max}, which reads as percent. ${dropNote('relative_humidity')} Bins with fewer than ${MIN_SAMPLES} samples are left out.`);
const windNote = `MEDA wind is in the archive only up to sol 315 ('wind data beyond sol 315 is not provided due to certain damage to some components of the wind sensor', release notes section B.4, ${RELEASE_NOTES}). Sol 312 is the last sol before the January 2022 dust storm (sols 313-318) and has the most wind data of sols 300-312. It is ${MY[312]} at Ls about 153, not the season of sol 1187. Only samples with ROVER_STILL = 1 are used. Bins with fewer than ${MIN_SAMPLES} samples are left out.`;
const speedProv = prov(ws, 'MEDA WS', 'HORIZONTAL_WIND_SPEED (meter/second)', `One-minute means of the horizontal speed. ${dropNote('wind_speed')} ${windNote}`);
const dirProv = prov(ws, 'MEDA WS', 'WIND_DIRECTION (degree)',
  `One-minute vector means of unit vectors. The SIS defines the column as 'wind direction clockwise with respect to the north in degrees' and does not say whether it is where the wind comes from or goes to. ${dropNote('wind_direction')} ${windNote}`);

const out = {
  schema_version: 1,
  title: 'MEDA sol 1187 weather replay',
  description: 'One sol of Perseverance MEDA pressure, air temperature and relative humidity at the Cheyava Falls site, plus one sol of MEDA wind from sol 312, in one-minute bins of local mean solar time, for the HUD environment strip (#20) and the mission clock (#59). Field definitions are in public/data/README.md.',
  historical_note: 'Every observation here is historical. None of it describes current conditions on Mars.',
  generated_by: 'scripts/build-meda-sol.mjs',
  provenance: {
    mission: 'Mars 2020',
    instrument: 'MEDA',
    product_id: `${P.ps.file}, ${P.ats.file}, ${P.rhs.file} (sol 1187); ${P.ws.file} (sol 312)`,
    site: siteA,
    sol_or_date: `sol 1187, ${solDate(ps.info)} (${MY[1187]}); wind from sol 312`,
    reference: REFERENCE,
    url: BUNDLE_DOI,
    locator: `Calibrated and derived environmental collections; formats in ${RDR_SIS}`,
    data_url: BUNDLE,
    license: COMMON_LICENSE,
    note: 'Channels carry their own provenance block. Wind comes from a different sol and site, and its block says so.',
  },
  time_axis: {
    unit: 'min',
    meaning: 'Each series t lists the LMST minutes (0 = local mean midnight, 1440 per sol) that have data. A value is the mean over [t, t+1). One LMST minute is 1/1440 sol, about 61.6 s. Minutes with no data are absent, so replay by interpolating between neighbours. The archive records MEDA in sessions, so the gaps are part of the record.',
    bin_min: 1,
    min_samples_per_bin: MIN_SAMPLES,
  },
  waypoints: {
    source: WAYPOINTS,
    reference: 'NASA/JPL-Caltech, Mars 2020 traverse waypoints (MMGIS)',
    origin: ORIGIN,
    sol_1187: wpA,
    sol_312: wpB,
  },
  series: [
    {
      id: 'sol_1187',
      sol: 1187,
      bin_min: 1,
      t: solA.minutes,
      channels: {
        pressure: channel('Pa', pressureProv, 1187, solA.values.pressure),
        air_temperature: channel('K', tempProv, 1187, solA.values.air_temperature),
        relative_humidity: channel('%', rhProv, 1187, solA.values.relative_humidity),
      },
    },
    {
      id: 'sol_0312_wind',
      sol: 312,
      bin_min: 1,
      t: solB.minutes,
      channels: {
        wind_speed: channel('m/s', speedProv, 312, solB.values.wind_speed),
        wind_direction: channel('deg', dirProv, 312, solB.values.wind_direction, { convention: 'clockwise from north' }),
      },
    },
  ],
  source_files: [ps, ats, rhs, ws].map((p) => ({ product: p.file, url: p.csv, label_url: p.xml, sha256: p.csv_sha256, bytes: p.csv_bytes, rows: p.rows.length })),
};

const text = stringifyCompact(out);
writeFileSync(root(OUT), text);
console.log(`wrote ${OUT}: sol 1187 ${solA.minutes.length} minutes, sol 312 ${solB.minutes.length} minutes, ${(Buffer.byteLength(text) / 1024).toFixed(1)} kB`);
for (const s of out.series) for (const [k, c] of Object.entries(s.channels)) console.log(` ${s.id} ${k}: ${c.stats.min} to ${c.stats.max} ${c.unit} (${c.stats.count} minutes) label "${c.label}"`);
console.log(' waypoints', JSON.stringify(wpA), JSON.stringify(wpB));
