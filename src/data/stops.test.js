import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROVENANCE_KEYS,
  arrivedStop,
  hasArrived,
  imageUrl,
  loadStops,
  nearestStop,
  parseStops,
  stopById,
  stopForWaypoint,
} from './stops.js';

const repoPath = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(repoPath(path), 'utf8'));

const data = readJson('public/data/stops.json');
const route = readJson('public/marswalk/assets/route.json');
const stops = parseStops(data);

/** Width and height from a baseline or progressive JPEG's SOF marker. */
function jpegSize(path) {
  const b = readFileSync(path);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error(`${path} is not a JPEG`);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + length;
  }
  throw new Error(`${path}: no SOF marker`);
}

const copy = () => structuredClone(data);

describe('stops.json', () => {
  it('has Bright Angel and Cheyava Falls', () => {
    expect(stops.map((s) => s.id)).toEqual(['bright-angel', 'cheyava-falls']);
  });

  it('gives each stop 2 to 4 sentences of text', () => {
    for (const stop of stops) {
      expect(stop.text.length).toBeGreaterThanOrEqual(2);
      expect(stop.text.length).toBeLessThanOrEqual(4);
      for (const s of stop.text) expect(s.sentence.length).toBeGreaterThan(20);
    }
  });

  it('carries the full shared provenance block on every sentence, image and value', () => {
    const blocks = [];
    for (const stop of stops) {
      blocks.push(stop.position.provenance, stop.arrival_radius.provenance);
      for (const s of stop.text) blocks.push(...s.provenance);
      for (const image of stop.images) blocks.push(image.provenance);
      for (const step of stop.checklist) blocks.push(step.provenance);
    }
    for (const block of blocks) {
      expect(Object.keys(block).sort()).toEqual([...PROVENANCE_KEYS].sort());
      expect(block.reference).toBeTruthy();
      expect(block.license).toBeTruthy();
      expect(block.note).toBeTruthy();
    }
  });

  it('cites a NASA page or a DOI for every DATA sentence', () => {
    for (const stop of stops) {
      for (const s of stop.text.filter((t) => t.tag === 'DATA')) {
        for (const block of s.provenance) expect(block.url).toMatch(/^https:\/\/((www|science)\.nasa\.gov|doi\.org)\//);
      }
    }
  });

  it('has at least one image per stop, on disk, under 300 KB, with a NASA credit', () => {
    for (const stop of stops) {
      expect(stop.images.length).toBeGreaterThanOrEqual(1);
      for (const image of stop.images) {
        const path = repoPath(`public/data/${image.file}`);
        expect(existsSync(path), image.file).toBe(true);
        const bytes = statSync(path).size;
        expect(bytes).toBeLessThan(300 * 1024);
        expect(bytes).toBe(image.bytes);
        expect(jpegSize(path)).toEqual({ width: image.width_px, height: image.height_px });
        expect(image.credit).toMatch(/^NASA\/JPL-Caltech/);
        expect(image.provenance.product_id).toBe(image.image_id);
        expect(image.provenance.sol_or_date).toContain(`sol ${image.sol}`);
      }
    }
  });

  it('notes that raw images are auto-stretched', () => {
    const raw = stops.flatMap((s) => s.images).filter((i) => i.original_url.includes('raw-images'));
    expect(raw.length).toBeGreaterThan(0);
    for (const image of raw) expect(image.provenance.note).toMatch(/auto-stretched/);
  });

  it('marks exactly one Cheyava Falls image as the reference match', () => {
    const images = stopById(stops, 'cheyava-falls').images;
    expect(images.filter((i) => i.reference_match).map((i) => i.image_id)).toEqual(['PIA26401']);
  });

  it('has the scenario 1 checklist on both stops', () => {
    for (const stop of stops) expect(stop.checklist.map((c) => c.id)).toEqual(['photo', 'texture', 'sample', 'seal']);
  });

  it('matches its route.json waypoint within 1 m', () => {
    for (const stop of stops) {
      const wp = route.waypoints.find((w) => w.name === stop.waypoint);
      expect(wp, stop.waypoint).toBeDefined();
      expect(Math.hypot(wp.x - stop.x, wp.z - stop.z)).toBeLessThanOrEqual(1);
    }
  });

  it('uses a 2 m arrival radius, as in scenario 1', () => {
    for (const stop of stops) expect(stop.arrival_radius).toMatchObject({ value: 2, unit: 'm' });
  });
});

describe('parseStops', () => {
  it('rejects a missing provenance key', () => {
    const d = copy();
    delete d.stops[0].text[0].provenance[0].locator;
    expect(() => parseStops(d)).toThrow(/locator/);
  });

  it('rejects a stop with no image', () => {
    const d = copy();
    d.stops[1].images = [];
    expect(() => parseStops(d)).toThrow(/image/);
  });

  it('rejects a DATA sentence without a url', () => {
    const d = copy();
    d.stops[1].text[0].provenance[0].url = null;
    expect(() => parseStops(d)).toThrow(/url/);
  });

  it('rejects duplicate ids', () => {
    const d = copy();
    d.stops[1].id = d.stops[0].id;
    expect(() => parseStops(d)).toThrow(/unique/);
  });
});

describe('lookups', () => {
  it('finds a stop by id and by waypoint', () => {
    expect(stopById(stops, 'cheyava-falls').name).toBe('Cheyava Falls');
    expect(stopById(stops, 'nope')).toBeNull();
    expect(stopForWaypoint(stops, route.waypoints[3]).id).toBe('bright-angel');
    expect(stopForWaypoint(stops, 'Cheyava Falls').id).toBe('cheyava-falls');
    expect(stopForWaypoint(stops, route.waypoints[0])).toBeNull();   // HAB has no stop
  });

  it('returns the nearest stop with its distance', () => {
    expect(nearestStop(stops, { x: 0, z: 0 })).toMatchObject({ stop: { id: 'cheyava-falls' }, distanceM: 0 });
    const ba = nearestStop(stops, { x: -40, z: -57 });
    expect(ba.stop.id).toBe('bright-angel');
    expect(ba.distanceM).toBeCloseTo(3, 6);
    // From the habitat Cheyava Falls is closer: hypot(520, 600) = 794 m vs hypot(560, 660) = 866 m.
    expect(nearestStop(stops, { x: 520, z: 600 }).stop.id).toBe('cheyava-falls');
    expect(nearestStop([], { x: 0, z: 0 })).toBeNull();
  });

  it('detects arrival within 2 m and not beyond', () => {
    const cf = stopById(stops, 'cheyava-falls');
    expect(hasArrived(cf, { x: 1.2, z: 1.6 })).toBe(true);    // exactly 2 m
    expect(hasArrived(cf, { x: 1.5, z: 1.5 })).toBe(false);   // 2.12 m
    expect(arrivedStop(stops, { x: -41, z: -61 }).id).toBe('bright-angel');
    expect(arrivedStop(stops, { x: -20, z: -30 })).toBeNull();
  });
});

describe('loading', () => {
  it('builds image URLs from the base', () => {
    expect(imageUrl({ file: 'images/a.jpg' }, '/')).toBe('/data/images/a.jpg');
    expect(imageUrl({ file: 'images/a.jpg' }, '/repo/')).toBe('/repo/data/images/a.jpg');
  });

  it('fetches and parses the file', async () => {
    const calls = [];
    const fake = async (url) => { calls.push(url); return { ok: true, json: async () => copy() }; };
    const loaded = await loadStops({ fetch: fake, base: '/' });
    expect(calls).toEqual(['/data/stops.json']);
    expect(loaded).toHaveLength(2);
  });

  it('throws on an HTTP error', async () => {
    const fake = async () => ({ ok: false, status: 404 });
    await expect(loadStops({ fetch: fake, base: '/' })).rejects.toThrow(/404/);
  });
});
