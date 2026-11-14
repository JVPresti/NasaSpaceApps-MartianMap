import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CREDITS_JSON, CREDITS_MD, buildCredits, readAllProvenance, renderMarkdown } from '../../scripts/build-credits.mjs';

const repoPath = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const text = (path) => readFileSync(repoPath(path), 'utf8');

const credits = JSON.parse(text(CREDITS_JSON));
const REQUIRED = ['id', 'name', 'kind', 'provider', 'credit_line', 'license', 'url', 'used_in'];

describe('public/data/credits.json', () => {
  it('has the statement and the groups the sources screen renders', () => {
    for (const key of ['real', 'artistic', 'modelled', 'data_tags']) {
      expect(typeof credits.statement[key]).toBe('string');
      expect(credits.statement[key].length).toBeGreaterThan(20);
    }
    expect(credits.kinds.map((k) => k.id)).toEqual(
      expect.arrayContaining(['terrain_imagery', 'weather', 'radiation', 'surface_images', 'models']),
    );
  });

  it('gives every entry the required fields, a known kind and an https link', () => {
    const kinds = new Set(credits.kinds.map((k) => k.id));
    for (const entry of credits.entries) {
      for (const key of REQUIRED) {
        expect(entry[key], `${entry.id}.${key}`).toBeTruthy();
      }
      expect(kinds.has(entry.kind), entry.id).toBe(true);
      expect(entry.url, entry.id).toMatch(/^https:\/\//);
      expect(Array.isArray(entry.used_in) && entry.used_in.length > 0, entry.id).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    const ids = credits.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('credits every provenance source in public/data', () => {
    const credited = new Set(credits.entries.flatMap((e) => e.source_urls));
    const missing = [...new Set(readAllProvenance().map((p) => p.block.url).filter(Boolean))].filter(
      (url) => !credited.has(url),
    );
    expect(missing, 'run npm run credits').toEqual([]);
  });

  it('matches a fresh run of npm run credits', () => {
    const fresh = buildCredits();
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(credits);
    expect(text(CREDITS_MD)).toBe(renderMarkdown(fresh));
  });

  it('gives the same output on two runs', () => {
    expect(JSON.stringify(buildCredits())).toBe(JSON.stringify(buildCredits()));
  });
});
