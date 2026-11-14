/**
 * Accessors for `public/data/meda_sol.json` and `public/data/rad.json` (#31).
 *
 * Plain JavaScript with no React and no three.js. The HUD (#20), the mission
 * clock (#59) and the radiation event (#25) read weather and dose values here
 * instead of parsing the files themselves. Every value comes back with its tag
 * and a HUD label built from the file's provenance block.
 */

/** Where the app serves the files, relative to the Vite base URL. */
export const MEDA_SOL_PATH = 'data/meda_sol.json';
export const RAD_PATH = 'data/rad.json';

const ROVER = { 'Mars 2020': 'Perseverance', MSL: 'Curiosity' };
const TAGS = new Set(['DATA', 'DERIVED', 'SIM']);

/** Seconds in one sol, counted in Mars seconds of local mean solar time (24 x 3600). */
export const LMST_SOL_SEC = 86400;

/**
 * HUD label from a provenance block: instrument, rover (and the site when it is
 * not Jezero), then the sol or the tag.
 *   MEDA on Perseverance, sol 1187 -> "MEDA · Perseverance · sol 1187"
 *   RAD on Curiosity in Gale       -> "RAD · Curiosity (Gale) · DATA"
 * @param {{ mission: string|null, instrument: string|null, site: string|null }} provenance
 * @param {{ sol?: number|null, tag?: string|null }} [options]
 */
export function hudLabel(provenance, { sol = null, tag = null } = {}) {
  const instrument = String(provenance.instrument ?? '').split(/[ ,(]/)[0];
  const rover = ROVER[provenance.mission] ?? provenance.mission ?? '';
  const site = String(provenance.site ?? '');
  const where = /not Jezero/i.test(site) ? ` (${site.split(/[ ,]/)[0]})` : '';
  const last = sol != null ? `sol ${sol}` : tag;
  return [instrument, rover + where, last].filter(Boolean).join(' · ');
}

/** Linear interpolation of `values` on the increasing axis `t`. Returns the value and the gap it spans. */
function sample(t, values, x) {
  const n = t.length;
  if (x <= t[0]) return { value: values[0], gap: 0 };
  if (x >= t[n - 1]) return { value: values[n - 1], gap: 0 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= x) lo = mid; else hi = mid;
  }
  const f = (x - t[lo]) / (t[hi] - t[lo]);
  return { value: values[lo] + f * (values[hi] - values[lo]), gap: t[hi] - t[lo], lo, hi, f };
}

/** Interpolate a channel that may hold nulls, by dropping the nulls first. */
function channelAxis(series, key) {
  const ch = series.channels[key];
  const t = [], v = [];
  for (let i = 0; i < series.t.length; i++) {
    if (ch.values[i] == null) continue;
    t.push(series.t[i] + series.bin_min / 2); // bin centre
    v.push(ch.values[i]);
  }
  return { t, v, ch };
}

/**
 * Check and index a parsed meda_sol.json. Throws with a readable message when a field is missing.
 * @param {object} json
 */
export function parseMedaSol(json) {
  if (!json || !Array.isArray(json.series)) throw new Error('meda_sol.json: series missing');
  const channels = {};
  for (const series of json.series) {
    if (!Array.isArray(series.t) || !series.channels) throw new Error(`meda_sol.json: series ${series.id} incomplete`);
    for (const [key, ch] of Object.entries(series.channels)) {
      if (!TAGS.has(ch.tag)) throw new Error(`meda_sol.json: ${key} has tag ${ch.tag}`);
      if (ch.values.length !== series.t.length) throw new Error(`meda_sol.json: ${key} length differs from t`);
      const axis = channelAxis(series, key);
      channels[key] = { ...axis, series, label: hudLabel(ch.provenance, { sol: series.sol }) };
    }
  }
  return { json, channels };
}

const STORE_KEYS = {
  pressure: 'pressurePa',
  air_temperature: 'tempC',
  relative_humidity: 'rhPct',
  wind_speed: 'windMs',
  wind_direction: 'windDirDeg',
};

/**
 * Weather at a local mean solar time, replaying the stored sol as a loop.
 *
 * Inside a run of recorded minutes the value is the linear blend of the two
 * nearest minute means, tagged like the channel (DATA). Across a gap in the
 * record the blend is tagged DERIVED and `interpolated` is true.
 *
 * @param {ReturnType<typeof parseMedaSol>} meda
 * @param {number} lmstSec seconds since local mean midnight, 0 to 86400 (wraps)
 * @returns {{ values: Record<string, number>, sources: Record<string, { tag: string, label: string, interpolated: boolean, source: string }> }}
 *   values keyed like the store's environment slice: pressurePa, tempC, windMs, windDirDeg, rhPct
 */
export function medaAt(meda, lmstSec) {
  const minute = (((lmstSec % LMST_SOL_SEC) + LMST_SOL_SEC) % LMST_SOL_SEC) / 60;
  const values = {}, sources = {};
  for (const [key, { t, v, ch, series, label }] of Object.entries(meda.channels)) {
    const storeKey = STORE_KEYS[key] ?? key;
    // Wrap the axis so the sol loops: last point of the sol, then the first point of the next sol.
    const tt = [t[t.length - 1] - 1440, ...t, t[0] + 1440];
    let vv = [v[v.length - 1], ...v, v[0]];
    if (key === 'wind_direction') vv = unwrapDegrees(vv);
    const s = sample(tt, vv, minute);
    let value = s.value;
    if (key === 'wind_direction') value = ((value % 360) + 360) % 360;
    if (key === 'air_temperature') value -= 273.15; // file is kelvin, store is °C
    const interpolated = s.gap > series.bin_min + 1e-9;
    values[storeKey] = value;
    sources[storeKey] = {
      tag: interpolated ? 'DERIVED' : ch.tag,
      label,
      interpolated,
      source: `${ch.provenance.instrument}, ${ch.provenance.product_id}`,
    };
  }
  return { values, sources };
}

/** Make a list of compass degrees continuous so linear interpolation takes the short way round. */
function unwrapDegrees(deg) {
  const out = [deg[0]];
  for (let i = 1; i < deg.length; i++) {
    let d = deg[i] - deg[i - 1];
    d -= 360 * Math.round(d / 360);
    out.push(out[i - 1] + d);
  }
  return out;
}

/**
 * Check a parsed rad.json and return its pieces.
 * @param {object} json
 */
export function parseRad(json) {
  const bg = json?.values?.['radiation.background.absorbed_dose_rate'];
  if (!bg || bg.unit !== 'mGy/day') throw new Error('rad.json: background absorbed dose rate missing');
  const ev = json.event;
  if (!ev || !Array.isArray(ev.t_min)) throw new Error('rad.json: event curve missing');
  for (const [key, ch] of Object.entries(ev.channels)) {
    if (ch.values.length !== ev.t_min.length) throw new Error(`rad.json: ${key} length differs from t_min`);
    if (ch.unit !== 'µGy/h') throw new Error(`rad.json: ${key} unit ${ch.unit}`);
  }
  return { json, background: bg, event: ev };
}

/**
 * Background surface dose rate (galactic cosmic rays, Gale crater).
 * @param {ReturnType<typeof parseRad>} rad
 */
export function radBackground(rad) {
  const bg = rad.background;
  const eq = rad.json.values['radiation.background.dose_equivalent_rate'];
  return {
    doseRateUgyH: (bg.value * 1000) / 24,
    doseEquivalentUsvH: eq ? (eq.value * 1000) / 24 : null,
    tag: bg.tag,
    label: hudLabel(bg.provenance, { tag: bg.tag }),
    source: `${bg.provenance.instrument}, ${bg.provenance.reference}`,
  };
}

/**
 * Dose rate of the September 2017 event at `tMin` minutes from its onset.
 * Before the curve starts the rate is the event's own baseline; after it ends,
 * the last value.
 *
 * @param {ReturnType<typeof parseRad>} rad
 * @param {number} tMin minutes from the onset at Mars
 * @param {{ channel?: 'dose_rate_b' | 'dose_rate_e' }} [options]
 * @returns {{ rateUgyH: number, excessUgyH: number, tag: string, label: string, source: string }}
 *   excessUgyH is the rate above the event's pre-onset baseline, never below 0
 */
export function radEventAt(rad, tMin, { channel = 'dose_rate_b' } = {}) {
  const ev = rad.event;
  const ch = ev.channels[channel];
  if (!ch) throw new Error('rad.json has no channel ' + channel);
  const base = ev.baseline[channel].value;
  const rate = tMin < ev.t_min[0] ? base : sample(ev.t_min, ch.values, tMin).value;
  return {
    rateUgyH: rate,
    excessUgyH: Math.max(0, rate - base),
    tag: ch.tag,
    label: hudLabel(ev.provenance, { tag: ch.tag }),
    source: `${ev.provenance.instrument} ${ch.detector}, ${ev.provenance.product_id.split(':')[0]}`,
  };
}
