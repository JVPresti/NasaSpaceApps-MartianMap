import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hudLabel, medaAt, parseMedaSol, parseRad, radBackground, radEventAt } from './medaRad.js';

const path = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(path(p), 'utf8'));

const medaJson = readJson('public/data/meda_sol.json');
const radJson = readJson('public/data/rad.json');
const hazards = readJson('public/data/hazards.json').values;

const PROVENANCE_KEYS = [
  'mission', 'instrument', 'product_id', 'site', 'sol_or_date', 'reference',
  'url', 'locator', 'data_url', 'license', 'note',
];
const TAGS = ['DATA', 'DERIVED', 'SIM'];

function expectProvenance(p, tag) {
  expect(Object.keys(p).sort()).toEqual([...PROVENANCE_KEYS].sort());
  for (const key of ['reference', 'license', 'note']) expect(p[key], key).toBeTruthy();
  if (tag !== 'SIM') expect(p.url).toMatch(/^https:\/\//);
}

const increasing = (xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('data files', () => {
  it('stay under 200 kB each', () => {
    for (const f of ['public/data/meda_sol.json', 'public/data/rad.json']) {
      expect(statSync(path(f)).size, f).toBeLessThan(200 * 1024);
    }
  });
});

describe('meda_sol.json', () => {
  const meda = parseMedaSol(medaJson);

  it('has a complete provenance block at the top and on every channel', () => {
    expectProvenance(medaJson.provenance, 'DATA');
    for (const series of medaJson.series) {
      for (const [key, ch] of Object.entries(series.channels)) {
        expect(TAGS, key).toContain(ch.tag);
        expect(ch.unit, key).toBeTruthy();
        expectProvenance(ch.provenance, ch.tag);
        expect(ch.provenance.mission).toBe('Mars 2020');
        expect(ch.provenance.instrument).toMatch(/^MEDA /);
        expect(ch.provenance.sol_or_date).toContain(`sol ${series.sol}`);
        expect(ch.label).toBe(hudLabel(ch.provenance, { sol: series.sol }));
      }
    }
  });

  it('keeps every series time-ordered inside one sol', () => {
    for (const series of medaJson.series) {
      expect(increasing(series.t), series.id).toBe(true);
      expect(series.t[0]).toBeGreaterThanOrEqual(0);
      expect(series.t.at(-1)).toBeLessThan(1440);
      for (const ch of Object.values(series.channels)) expect(ch.values).toHaveLength(series.t.length);
    }
  });

  it('covers most of the sol', () => {
    expect(medaJson.series[0].t.length).toBeGreaterThan(1000);
    expect(medaJson.series[1].t.length).toBeGreaterThan(1000);
  });

  it('holds plausible values for Jezero', () => {
    const [sol, wind] = medaJson.series;
    const nums = (ch) => ch.values.filter((v) => v != null);
    const within = (xs, lo, hi) => xs.every((x) => x >= lo && x <= hi);
    expect(within(nums(sol.channels.pressure), 600, 1000)).toBe(true);
    expect(within(nums(sol.channels.air_temperature), 170, 290)).toBe(true);
    expect(within(nums(sol.channels.relative_humidity), 0, 100)).toBe(true);
    expect(within(nums(wind.channels.wind_speed), 0, 40)).toBe(true);
    expect(within(nums(wind.channels.wind_direction), 0, 360)).toBe(true);
    // The daily cycle is there: afternoon is warmer than the night.
    const tempAt = (minute) => medaAt(meda, minute * 60).values.tempC;
    expect(tempAt(13 * 60 + 30)).toBeGreaterThan(tempAt(4 * 60) + 30);
  });

  it('says that wind comes from another sol and site', () => {
    const wind = medaJson.series[1];
    expect(wind.sol).toBe(312);
    expect(wind.channels.wind_speed.provenance.site).toMatch(/not at Cheyava Falls/);
    expect(wind.channels.wind_speed.provenance.note).toMatch(/sol 315/);
  });

  it('returns minute means with their tag and label', () => {
    const series = medaJson.series[0];
    const i = series.t.indexOf(600);
    expect(i).toBeGreaterThan(-1);
    const { values, sources } = medaAt(meda, 600.5 * 60);
    expect(values.pressurePa).toBeCloseTo(series.channels.pressure.values[i], 6);
    expect(values.tempC).toBeCloseTo(series.channels.air_temperature.values[i] - 273.15, 6);
    expect(sources.pressurePa).toMatchObject({ tag: 'DATA', label: 'MEDA · Perseverance · sol 1187', interpolated: false });
    expect(sources.windMs.label).toBe('MEDA · Perseverance · sol 312');
  });

  it('tags values bridged across a recording gap as DERIVED', () => {
    const t = medaJson.series[0].t;
    const gapAt = t.findIndex((x, i) => i > 0 && x - t[i - 1] > 10);
    const mid = (t[gapAt - 1] + t[gapAt]) / 2;
    const { sources } = medaAt(meda, mid * 60);
    expect(sources.pressurePa).toMatchObject({ tag: 'DERIVED', interpolated: true });
  });

  it('loops the sol at midnight', () => {
    const a = medaAt(meda, 0).values;
    const b = medaAt(meda, 86400).values;
    expect(b.pressurePa).toBeCloseTo(a.pressurePa, 9);
    expect(medaAt(meda, -60).values.pressurePa).toBeCloseTo(medaAt(meda, 86340).values.pressurePa, 9);
  });

  it('interpolates wind direction the short way round north', () => {
    const fake = parseMedaSol({
      series: [{
        id: 'x', sol: 1, bin_min: 1, t: [0, 2],
        channels: { wind_direction: { tag: 'DATA', provenance: { mission: 'Mars 2020', instrument: 'MEDA WS', site: 'Jezero', product_id: 'p' }, values: [350, 10] } },
      }],
    });
    expect(medaAt(fake, 1.5 * 60).values.windDirDeg).toBeCloseTo(0, 6);
  });
});

describe('rad.json', () => {
  const rad = parseRad(radJson);

  it('copies the background values from hazards.json unchanged', () => {
    for (const id of ['radiation.background.absorbed_dose_rate', 'radiation.background.dose_equivalent_rate']) {
      expect(radJson.values[id], id).toEqual(hazards[id]);
    }
    expect(radBackground(rad).doseRateUgyH).toBeCloseTo(8.75, 9);
  });

  it('has a complete provenance block that names Gale crater', () => {
    for (const v of Object.values(radJson.values)) {
      expect(TAGS).toContain(v.tag);
      expectProvenance(v.provenance, v.tag);
      expect(v.provenance.site).toMatch(/^Gale crater.*not Jezero$/);
    }
    const ev = radJson.event;
    expectProvenance(ev.provenance, ev.tag);
    expect(ev.provenance.site).toBe('Gale crater, not Jezero');
    for (const ch of Object.values(ev.channels)) expect(TAGS).toContain(ch.tag);
    expect(ev.time_axis.tag).toBe('DERIVED');
  });

  it('lines the event up with the DONKI and RAD timing in hazards.json', () => {
    const axis = radJson.event.time_axis;
    expect(axis.onset_utc).toBe(hazards['radiation.sep_2017.onset_at_mars'].value);
    expect(axis.flare_peak_t_min).toBe(-hazards['radiation.sep_2017.warning_lead_time'].value);
    expect(axis.shock_t_min).toBe(57 * 60 + 10);
  });

  it('keeps the curve time-ordered with positive dose rates', () => {
    const ev = radJson.event;
    expect(increasing(ev.t_min)).toBe(true);
    expect(ev.t_min[0]).toBeLessThan(0);
    expect(ev.t_min.at(-1)).toBeGreaterThan(ev.time_axis.shock_t_min);
    for (const ch of Object.values(ev.channels)) for (const v of ch.values) expect(v).toBeGreaterThan(0);
  });

  it('agrees with the published E detector rates within 2 %', () => {
    for (const row of radJson.event.checks.rows.filter((r) => r.id.startsWith('rate_') && r.published_e != null)) {
      expect(Math.abs(row.archive_e - row.published_e) / row.published_e, row.id).toBeLessThan(0.02);
    }
  });

  it('returns dose rates with the Gale label', () => {
    const ev = radJson.event;
    const peak = radEventAt(rad, 782);
    expect(peak.rateUgyH).toBeGreaterThan(2 * ev.baseline.dose_rate_b.value);
    expect(peak.excessUgyH).toBeCloseTo(peak.rateUgyH - ev.baseline.dose_rate_b.value, 9);
    expect(peak.label).toBe('RAD · Curiosity (Gale) · DATA');
    expect(radEventAt(rad, -5000)).toMatchObject({ rateUgyH: ev.baseline.dose_rate_b.value, excessUgyH: 0 });
    expect(radEventAt(rad, ev.t_min[10]).rateUgyH).toBe(ev.channels.dose_rate_b.values[10]);
    expect(radEventAt(rad, 782, { channel: 'dose_rate_e' }).rateUgyH).toBeGreaterThan(20);
    expect(radBackground(rad).label).toBe('RAD · Curiosity (Gale) · DATA');
  });
});

describe('hudLabel', () => {
  it('builds the HUD text from a provenance block', () => {
    expect(hudLabel({ mission: 'Mars 2020', instrument: 'MEDA PS', site: 'Jezero crater' }, { sol: 1205 })).toBe('MEDA · Perseverance · sol 1205');
    expect(hudLabel({ mission: 'MSL', instrument: 'RAD', site: 'Gale crater, not Jezero' }, { tag: 'DATA' })).toBe('RAD · Curiosity (Gale) · DATA');
    expect(hudLabel({ mission: 'MSL', instrument: 'RAD (B detector)', site: 'Gale crater (-4.4 km MOLA), not Jezero' }, { tag: 'DATA' })).toBe('RAD · Curiosity (Gale) · DATA');
  });
});
