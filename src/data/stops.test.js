import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stopHasContent } from '../stops/content.js';
import { arrivalRadiusM } from '../sim/waypointRunner.js';
import {
  PROVENANCE_KEYS,
  allStops,
  arrivedStop,
  hasArrived,
  imageUrl,
  loadStops,
  nearestStop,
  parseRouteStops,
  parseStops,
  routeStopCandidates,
  stopById,
  stopReason,
  stopForWaypoint,
  workTimeSec,
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

  it('gives each science stop a work time, tagged SIM with its reasoning (#247)', () => {
    for (const stop of stops) {
      expect(stop.work_time_s).toMatchObject({ unit: 's', tag: 'SIM' });
      expect(workTimeSec(stop)).toBeGreaterThan(0);
      expect(stop.work_time_s.provenance.note).toMatch(/estimate/);
      expect(Object.keys(stop.work_time_s.provenance).sort()).toEqual([...PROVENANCE_KEYS].sort());
    }
    expect(workTimeSec(stopById(stops, 'cheyava-falls'))).toBe(1200);
    expect(workTimeSec(stopById(stops, 'bright-angel'))).toBe(900);
    expect(workTimeSec({})).toBe(0);
  });
});

describe('route stops without a card (#265)', () => {
  const shelters = readJson('public/data/shelters.json');
  const airlock = shelters.shelters.find((s) => s.id === 'HAB');
  const routeStops = parseRouteStops(data);

  it('has the first sortie stop, tagged SIM with its reasoning and a work time', () => {
    expect(routeStops.map((s) => s.id)).toEqual(['sortie']);
    const [sortie] = routeStops;
    expect(sortie.position.tag).toBe('SIM');
    expect(sortie.position.provenance.note).toMatch(/55 m of walking/);
    expect(Object.keys(sortie.position.provenance).sort()).toEqual([...PROVENANCE_KEYS].sort());
    expect(sortie.work_time_s).toMatchObject({ value: 120, unit: 's', tag: 'SIM' });
    expect(sortie.work_time_s.provenance.note).toMatch(/2 min/);
    expect(sortie.name).toBe('Light-toned patch');
  });

  it('says in one SIM line, in English and Spanish, why the sortie stop is worth the walk (D10)', () => {
    const [sortie] = routeStops;
    expect(sortie.reason.tag).toBe('SIM');
    expect(sortie.reason.en).toMatch(/no rover has looked here/);
    expect(sortie.reason.es).toMatch(/ning\u00fan rover ha mirado aqu\u00ed/);
    expect(Object.keys(sortie.reason.provenance).sort()).toEqual([...PROVENANCE_KEYS].sort());
    const candidate = routeStopCandidates(data).find((s) => s.id === 'sortie');
    expect(stopReason(candidate, 'es')).toBe(sortie.reason.es);
    expect(stopReason(candidate)).toBe(sortie.reason.en);
    expect(stopReason(routeStopCandidates(data)[0])).toBeNull();   // a science stop has its card instead
    const d = copy();
    d.route_stops[0].reason.es = '';
    expect(() => parseRouteStops(d)).toThrow(/reason needs es/);
  });

  it('counts anywhere on the 8 m light-toned patch as reaching the sortie stop, with no card to open', () => {
    const [sortie] = routeStops;
    expect(sortie.arrival_radius).toMatchObject({ value: 8, unit: 'm', tag: 'SIM' });
    expect(sortie.arrival_radius.provenance.note).toMatch(/8 m around the point/);
    // the waypoint runner takes its radii from loadStops, which now lists the route stops too
    const every = allStops(data);
    expect(arrivalRadiusM(every, sortie.waypoint)).toBe(8);
    expect(arrivalRadiusM(every, 'Cheyava Falls')).toBe(2);
    expect(stopHasContent(stopForWaypoint(every, sortie.waypoint))).toBe(false);
  });

  it('sits about 55 m from the airlock, outside route.json and with no science card', () => {
    const [sortie] = routeStops;
    const distance = Math.hypot(sortie.x - airlock.x, sortie.z - airlock.z);
    expect(distance).toBeGreaterThan(50);
    expect(distance).toBeLessThan(60);
    expect(route.waypoints.some((w) => w.name === sortie.waypoint)).toBe(false);
    expect(stopForWaypoint(stops, sortie.waypoint)).toBeNull();
  });

  it('lists every stop the route generator can choose, with its work time for a pair', () => {
    const candidates = routeStopCandidates(data);
    expect(candidates.map((s) => [s.id, s.workSec, s.card])).toEqual([
      ['bright-angel', 900, true],
      ['cheyava-falls', 1200, true],
      ['sortie', 120, false],
    ]);
    expect(candidates.find((s) => s.id === 'cheyava-falls')).toMatchObject({ waypoint: 'Cheyava Falls', x: 0, z: 0 });
  });

  it('rejects a route stop with an id already used, or without a work time', () => {
    const d = copy();
    d.route_stops[0].id = 'cheyava-falls';
    expect(() => parseRouteStops(d)).toThrow(/unique/);
    const e = copy();
    delete e.route_stops[0].work_time_s;
    expect(() => parseRouteStops(e)).toThrow(/work_time_s/);
    const f = copy();
    delete f.route_stops[0].arrival_radius;
    expect(() => parseRouteStops(f)).toThrow(/arrival_radius/);
    expect(parseRouteStops({ stops: [] })).toEqual([]);
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

  it('rejects a negative work time', () => {
    const d = copy();
    d.stops[0].work_time_s.value = -1;
    expect(() => parseStops(d)).toThrow(/work_time_s/);
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
    const ba = nearestStop(stops, { x: -11, z: -47 });
    expect(ba.stop.id).toBe('bright-angel');
    expect(ba.distanceM).toBeCloseTo(3, 6);
    // From the habitat Cheyava Falls is closer: hypot(520, 600) = 794 m vs hypot(531, 650) = 839 m.
    expect(nearestStop(stops, { x: 520, z: 600 }).stop.id).toBe('cheyava-falls');
    expect(nearestStop([], { x: 0, z: 0 })).toBeNull();
  });

  it('detects arrival within 2 m and not beyond', () => {
    const cf = stopById(stops, 'cheyava-falls');
    expect(hasArrived(cf, { x: 1.2, z: 1.6 })).toBe(true);    // exactly 2 m
    expect(hasArrived(cf, { x: 1.5, z: 1.5 })).toBe(false);   // 2.12 m
    expect(arrivedStop(stops, { x: -12, z: -51 }).id).toBe('bright-angel');
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
    expect(loaded.map((s) => s.id)).toEqual(['bright-angel', 'cheyava-falls', 'sortie']);
  });

  it('throws on an HTTP error', async () => {
    const fake = async () => ({ ok: false, status: 404 });
    await expect(loadStops({ fetch: fake, base: '/' })).rejects.toThrow(/404/);
  });
});
