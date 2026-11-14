import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { legCostSources } from '../sim/legCosts.js';
import { MISSION_CLOCK_SOURCES } from '../sim/missionClock.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { ROUTE_SOURCES } from '../plan/routePlan.js';
import { createMockState } from '../state/mock.js';
import { medaAt, parseMedaSol } from './medaRad.js';
import { createProvenanceRegistry, describeEntry, loadProvenance, STORE_PATHS, textAlternative } from './provenance.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const files = {
  hazards: readJson('public/data/hazards.json'),
  meda: readJson('public/data/meda_sol.json'),
  rad: readJson('public/data/rad.json'),
  credits: readJson('public/data/credits.json'),
};

const loaded = () => createProvenanceRegistry({ dev: false, entries: STORE_PATHS }).loadData(files);

describe('provenance registry', () => {
  it('reproduces the dust storm mockup labels', () => {
    const r = loaded();
    expect(r.resolve('environment.pressurePa').short).toBe('MEDA · Perseverance');
    expect(r.resolve('environment.tempC').short).toBe('MEDA · Perseverance');
    expect(r.resolve('environment.doseRateUgyH').short).toBe('RAD · Curiosity');
    expect(r.resolve('navigation.x').label).toBe('SIM');
    expect(r.resolve('suit.oxygenPct', { tag: 'SIM', source: 'mock' }).label).toBe('SIM');
  });

  it('labels MEDA values with their sol and RAD values with Gale', () => {
    const r = loaded();
    const p = r.resolve('environment.pressurePa');
    expect(p).toMatchObject({ tag: 'DATA', label: 'MEDA · Perseverance · sol 1187', mission: 'Mars 2020' });
    expect(p.link).toMatch(/^https:\/\//);
    expect(r.resolve('environment.windMs').label).toBe('MEDA · Perseverance · sol 312');
    expect(r.resolve('environment.doseRateUgyH').label).toBe('RAD · Curiosity (Gale)');
  });

  it('states Gale crater on every RAD entry', () => {
    const r = loaded();
    const rad = r.paths().map((p) => r.lookup(p)).filter((e) => e.instrument === 'RAD');
    expect(rad.map((e) => e.path).sort()).toEqual(['environment.doseRateUgyH', 'environment.doseUgy']);
    for (const e of rad) {
      expect(e.site).toMatch(/Gale crater/);
      expect(e.site).toMatch(/not Jezero/);
      expect(textAlternative(e)).toMatch(/Gale crater/);
    }
    // before the files load the declared entry already says Gale
    expect(createProvenanceRegistry({ dev: false, entries: STORE_PATHS }).lookup('environment.doseRateUgyH').site).toMatch(/Gale crater/);
  });

  it('fills DATA entries from hazards.json and credits.json', () => {
    const r = loaded();
    expect(r.lookup('suit.pressurePsi')).toMatchObject({ tag: 'DATA', label: 'xEVA con ops · NASA', mission: 'Artemis' });
    expect(r.lookup('route.distanceM')).toMatchObject({ tag: 'DERIVED', mission: 'MRO', instrument: 'HiRISE' });
    expect(r.lookup('suit.oxygenPct').mission).toMatch(/Artemis/);
  });

  it('lets the live store entry override the tag and label', () => {
    const r = loaded();
    const meda = parseMedaSol(files.meda);
    const gap = meda.channels.pressure.t.findIndex((t, i, a) => i > 0 && t - a[i - 1] > 1);
    const mid = (meda.channels.pressure.t[gap - 1] + meda.channels.pressure.t[gap]) / 2;
    const live = medaAt(meda, mid * 60).sources.pressurePa;
    expect(live.tag).toBe('DERIVED');
    const e = r.resolve('environment.pressurePa', live);
    expect(e).toMatchObject({ tag: 'DERIVED', label: 'MEDA · Perseverance · sol 1187', mission: 'Mars 2020' });
    // a SIM override with no label drops the MEDA details
    const mock = r.resolve('environment.tempC', { tag: 'SIM', source: 'mock value' });
    expect(mock).toMatchObject({ tag: 'SIM', label: 'SIM', source: 'mock value', mission: null });
  });

  it('accepts entries declared in code', () => {
    const r = createProvenanceRegistry({ dev: false }).define({ 'crew.0.oxygenPct': { tag: 'SIM', source: 'partner suit model' } });
    expect(r.resolve('crew.0.oxygenPct')).toMatchObject({ tag: 'SIM', label: 'SIM', source: 'partner suit model' });
    expect(() => r.define({ 'x.y': { tag: 'MEASURED' } })).toThrow(/tag/);
  });

  it('warns once in development for a path with no entry', () => {
    const warn = vi.fn();
    const r = createProvenanceRegistry({ dev: true, warn, entries: STORE_PATHS });
    expect(r.resolve('environment.nope')).toBeNull();
    r.resolve('environment.nope');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/environment\.nope/);
    r.resolve('environment.tempC');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stays silent in production', () => {
    const warn = vi.fn();
    const r = createProvenanceRegistry({ dev: false, warn });
    expect(r.resolve('environment.nope')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('describes an entry for the tooltip', () => {
    const lines = describeEntry(loaded().lookup('environment.doseRateUgyH'));
    expect(lines.map(([k]) => k)).toEqual(expect.arrayContaining(['Tag', 'Mission', 'Instrument', 'Site', 'Sol or date', 'Reference']));
    expect(lines.find(([k]) => k === 'Reference')[2]).toMatch(/^https:\/\//);
  });

  it('loads the files through fetch and keeps declared entries when one fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = async (url) => {
      if (url.endsWith('rad.json')) return { ok: false, status: 404 };
      const name = url.split('/').pop().replace('.json', '');
      return { ok: true, json: async () => ({ hazards: files.hazards, meda_sol: files.meda, credits: files.credits })[name] };
    };
    const r = await loadProvenance({ registry: createProvenanceRegistry({ dev: false, entries: STORE_PATHS }), fetchFn, base: '/' });
    expect(r.lookup('environment.tempC').label).toBe('MEDA · Perseverance · sol 1187');
    expect(r.lookup('environment.doseRateUgyH').label).toBe('RAD · Curiosity (Gale)');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// Every path any writer puts in the store's `sources` map must have a registry entry.
function writtenPaths() {
  const paths = new Set([
    ...Object.keys(createMockState().sources),
    ...Object.keys(MISSION_CLOCK_SOURCES),
    ...Object.keys(suitConstantsFromHazards(files.hazards).sources),
    ...Object.keys(legCostSources(files.hazards)),
    ...Object.keys(ROUTE_SOURCES),
    ...Object.keys(medaAt(parseMedaSol(files.meda), 600 * 60).sources).map((k) => 'environment.' + k),
  ]);
  // literal writes such as `'route.path': { tag: 'DERIVED', ... }` anywhere in src
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
  for (const file of walk(join(root, 'src'))) {
    if (file.endsWith('provenance.js')) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/'((?:mission|suit|navigation|route|environment)\.[\w.]+)':\s*\{\s*tag:/g)) paths.add(m[1]);
  }
  return [...paths].sort();
}

describe('store coverage', () => {
  it('has an entry for every path the store keeps under sources', () => {
    const r = loaded();
    const paths = writtenPaths();
    expect(paths.length).toBeGreaterThan(50);
    expect(paths.filter((p) => !r.has(p))).toEqual([]);
  });
});
