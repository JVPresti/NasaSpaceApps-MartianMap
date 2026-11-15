import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import { LAST_KNOWN_COLOR, ageText, crewMarks, polylinePoints, suitCss } from './crewMap.js';

const crop = { x0: 0, z0: 0, size: 100 };

describe('crew marks on the habitat map', () => {
  it('a suit in sight is drawn in its colour at its position', () => {
    expect(crewMarks([{ id: 'a', name: 'Ana', color: 0, x: 25, z: 75, link: true, lastKnown: false }], crop))
      .toEqual([{ id: 'a', name: 'Ana', u: 25, v: 75, lastKnown: false, color: suitCss(0) }]);
  });

  it('a suit behind a ridge is grey and flagged last known', () => {
    const [m] = crewMarks([{ id: 'a', name: 'Ana', color: 2, x: 10, z: 10, link: false, lastKnown: true }], crop);
    expect(m).toMatchObject({ lastKnown: true, color: LAST_KNOWN_COLOR });
  });

  it('leaves out suits outside the crop and entries without a position', () => {
    expect(crewMarks([{ id: 'a', x: 500, z: 10 }, { id: 'b', x: null, z: 1 }], crop)).toEqual([]);
  });

  it('polyline points and ages', () => {
    expect(polylinePoints([[0, 0], [50, 100]], crop)).toBe('0.00,0.00 50.00,100.00');
    expect(polylinePoints(null, crop)).toBe('');
    const t = (key, v) => key + ':' + v.n;
    expect(ageText(42_400, t)).toBe('online.habitat.seconds:42');
    expect(ageText(185_000, t)).toBe('online.habitat.minutes:3');
  });
});

describe('habitat seat strings', () => {
  const DIR = dirname(fileURLToPath(import.meta.url));
  const used = new Set();
  for (const file of readdirSync(DIR).filter((f) => /\.(jsx?|js)$/.test(f) && !f.includes('.test.'))) {
    for (const m of readFileSync(join(DIR, file), 'utf8').matchAll(/['"](online\.habitat\.[a-z.]+)['"]/g)) used.add(m[1]);
  }

  it('every key the components use exists in English and Spanish', () => {
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      expect(en[key], 'en ' + key).toBeTypeOf('string');
      expect(es[key], 'es ' + key).toBeTypeOf('string');
    }
  });

  it('both catalogs have the same online.habitat keys, with the same placeholders', () => {
    const keys = (cat) => Object.keys(cat).filter((k) => k.startsWith('online.habitat.')).sort();
    expect(keys(es)).toEqual(keys(en));
    const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of keys(en)) expect(holes(es[k]), k).toEqual(holes(en[k]));
  });
});
