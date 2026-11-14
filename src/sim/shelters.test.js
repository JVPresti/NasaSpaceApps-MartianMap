import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COST_CONSTANTS, buildCostGrid, isBlockedAt, slopeAt } from './costGrid.js';
import { replanToNearestShelter } from './replan.js';
import { parseShelters, replanForEvent, sheltersForEvent } from './shelters.js';
import { skyViewAt } from './skyView.js';

const readJson = (path) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));

const data = readJson('public/data/shelters.json');
const grid = buildCostGrid(readJson('public/marswalk/assets/terrain.json'));
const PROVENANCE_KEYS = [
  'mission', 'instrument', 'product_id', 'site', 'sol_or_date', 'reference',
  'url', 'locator', 'data_url', 'license', 'note',
];

describe('shelters.json', () => {
  const shelters = parseShelters(data);

  it('lists HAB first and at least one natural safe point', () => {
    expect(shelters[0]).toMatchObject({ id: 'HAB', type: 'habitat', protection: 'full' });
    expect(shelters.filter((s) => s.type === 'natural').length).toBeGreaterThanOrEqual(1);
  });

  it('carries the shared provenance block on every value', () => {
    for (const shelter of shelters) {
      expect(Object.keys(shelter.values).length).toBeGreaterThan(0);
      for (const value of Object.values(shelter.values)) {
        expect(['DATA', 'DERIVED', 'SIM']).toContain(value.tag);
        expect(typeof value.label).toBe('string');
        expect(Object.keys(value.provenance).sort()).toEqual([...PROVENANCE_KEYS].sort());
        expect(value.provenance.reference).toBeTruthy();
        expect(value.provenance.license).toBeTruthy();
        expect(value.provenance.note).toBeTruthy();
      }
    }
  });

  it('tags the natural sky view and dose reduction as DERIVED and states the assumption', () => {
    for (const shelter of shelters.filter((s) => s.type === 'natural')) {
      const { sky_view_factor: svf, dose_reduction: cut } = shelter.values;
      expect(svf.tag).toBe('DERIVED');
      expect(cut.tag).toBe('DERIVED');
      expect(cut.value).toBeCloseTo(1 - svf.value, 3);
      expect(svf.provenance.note).toMatch(/isotropic SEP flux above the horizon/);
      expect(svf.value).toBeLessThanOrEqual(1 - data.sky_view.selection.minDoseReduction);
    }
  });

  it('matches a fresh sky view computation at each natural point', () => {
    for (const shelter of shelters.filter((s) => s.type === 'natural')) {
      const { skyView } = skyViewAt(grid, shelter.x, shelter.z, { azimuths: 72 });
      expect(skyView).toBeCloseTo(shelter.values.sky_view_factor.value, 2);
    }
  });

  it('puts every shelter on walkable ground', () => {
    for (const shelter of shelters) {
      expect(isBlockedAt(grid, shelter.x, shelter.z)).toBe(false);
      expect(slopeAt(grid, shelter.x, shelter.z)).toBeLessThan(COST_CONSTANTS.SLOPE_LIMIT_DEG);
    }
  });

  it('reaches every shelter from HAB with the planner', () => {
    const hab = shelters[0];
    for (const shelter of shelters.slice(1)) {
      const result = replanToNearestShelter(grid, hab, [shelter], { heuristicWeight: 1 });
      expect(result.ok, shelter.id).toBe(true);
      const [x, z] = result.path[result.path.length - 1];
      expect(Math.hypot(x - shelter.x, z - shelter.z)).toBeLessThan(1);
    }
  });
});

describe('sheltersForEvent', () => {
  it('returns HAB first in the shape replan takes', () => {
    const list = sheltersForEvent(data, 'radiation');
    expect(list[0]).toEqual({ id: 'HAB', name: data.shelters[0].name, x: data.shelters[0].x, z: data.shelters[0].z });
    expect(list.length).toBe(data.shelters.length);
  });

  it('keeps only the habitat for events terrain does not help with', () => {
    expect(sheltersForEvent(data, 'dust_storm').map((s) => s.id)).toEqual(['HAB']);
    expect(sheltersForEvent(data, 'low_oxygen').map((s) => s.id)).toEqual(['HAB']);
    expect(sheltersForEvent(data, 'radiation', { target: 'habitat' }).map((s) => s.id)).toEqual(['HAB']);
  });

  it('rejects a file without HAB first', () => {
    expect(() => parseShelters({ shelters: data.shelters.slice(1) })).toThrow(/HAB first/);
  });
});

describe('replanForEvent', () => {
  it('sends the crew to the habitat when it can be reached', () => {
    const result = replanForEvent(grid, { x: 0, z: 0 }, data, 'radiation', { reason: 'SEP alert' });
    expect(result.ok).toBe(true);
    expect(result.target.id).toBe('HAB');
    expect(result.protection).toBe('full');
  });

  it('falls back to a natural safe point when the habitat is cut off', () => {
    const hab = data.shelters[0];
    const zones = [{ x: hab.x, z: hab.z, radius: 40, blocked: true }];
    const result = replanForEvent(grid, { x: 0, z: 0 }, data, 'radiation', { zones });
    expect(result.ok).toBe(true);
    expect(result.protection).toBe('partial');
    expect(result.target.id).toMatch(/^SP/);
  });
});
