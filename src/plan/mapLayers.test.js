import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { routeStopCandidates } from '../data/stops.js';
import { setLanguage } from '../i18n/index.js';
import { radioShadowMask } from '../sim/radio.js';
import { LAYERS } from './layers.js';
import {
  LAYER, MAP_MIN_SPAN_M, acrossLabel, clampCrop, contourLine, drawMapPosition, fromMap, layerColour, layerPlaces, mapCrop, marsColour, paintMap, sampleRed, slopeGrid, tagFlips,
  toMap, waypointTaskTag, zoomCrop,
} from './mapLayers.js';
import { exposureText } from './routeExposure.js';

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));

afterEach(() => setLanguage('en'));

const tile = { width: 1422.5, depth: 1500 };
const route = [{ x: 535, z: 574 }, { x: 330, z: 300 }, { x: 150, z: 120 }, { x: -40, z: -60 }, { x: 0, z: 0 }];

/** A tiny terrain as costGrid.decodeTerrain returns it, with a density grid. */
function terrainOf(n, size, heightAt, densityAt = () => 128) {
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) heights[j * n + i] = heightAt(i, j);
  const density = new Uint8Array(4 * 4);
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) density[r * 4 + c] = densityAt(c, r);
  return { n, width: size, depth: size, heights, range: Math.max(...heights) || 1, density, densityN: 4 };
}

const ortho = { w: 2, h: 2, data: new Uint8ClampedArray(16).fill(128) };
const alpha = (out) => [...out].filter((value, k) => k % 4 === 3);
const pixel = (out, size, px, py) => [...out.slice((py * size + px) * 4, (py * size + px) * 4 + 3)];

describe('mission table map', () => {
  it('frames the whole route in a square inside the tile', () => {
    const crop = mapCrop(route, tile);
    for (const p of route) {
      const [u, v] = toMap(p.x, p.z, crop);
      expect(u).toBeGreaterThan(0); expect(u).toBeLessThan(100);
      expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(100);
    }
    expect(crop.x0).toBeGreaterThanOrEqual(-tile.width / 2);
    expect(crop.z0 + crop.size).toBeLessThanOrEqual(tile.depth / 2);
    expect(acrossLabel(crop.size)).toMatch(/^\d+ m across$/);
  });

  it('frames a short sortie at the minimum span and the full EVA at its own size', () => {
    const sortie = [{ x: 535.1, z: 574.1 }, { x: 493, z: 539 }];
    const small = mapCrop(sortie, tile, { min: MAP_MIN_SPAN_M });
    expect(small.size).toBe(MAP_MIN_SPAN_M);
    for (const p of sortie) {
      const [u, v] = toMap(p.x, p.z, small);
      expect(u).toBeGreaterThan(10); expect(u).toBeLessThan(90);
      expect(v).toBeGreaterThan(10); expect(v).toBeLessThan(90);
    }
    // 55 m between the airlock and the stop is now about a third of the map, not a tenth of a 500 m one
    expect(Math.hypot(sortie[0].x - sortie[1].x, sortie[0].z - sortie[1].z) / small.size).toBeGreaterThan(0.3);
    const full = mapCrop(route, tile, { min: MAP_MIN_SPAN_M });
    expect(full.size).toBeGreaterThan(700);
    expect(full.size).toBeLessThanOrEqual(tile.width);
  });

  it('draws the crew position with its ring and no text label, so it never covers a stop name (A2)', () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (target, key) => (key in target ? target[key] : () => { calls.push(key); return { width: 40 }; }),
      set: (target, key, value) => { target[key] = value; return true; },
    });
    const crop = { x0: 0, z0: 0, size: 100 };
    const nav = { x: 50, z: 50, errorM: 1.5, headingDeg: 90, fixMode: 'dead reckoning' };
    expect(drawMapPosition(ctx, nav, crop, { w: 400, h: 400 })).toBe(true);
    expect(calls.filter((c) => c === 'arc').length).toBeGreaterThanOrEqual(2);   // the uncertainty ring and the dot
    expect(calls).not.toContain('fillText');   // no "±1.5 m · dead reckoning" beside the stop
    expect(drawMapPosition(ctx, { x: null, z: null }, crop, { w: 400, h: 400 })).toBe(false);
  });

  it('puts north up and east right', () => {
    const crop = { x0: -100, z0: -100, size: 200 };
    expect(toMap(0, -100, crop)[1]).toBe(0);    // z is south, so the smallest z is the top edge
    expect(toMap(100, 0, crop)[0]).toBe(100);
  });

  it('zooms about the pointer and stays inside the tile', () => {
    const crop = { x0: -100, z0: -100, size: 400 };
    const zoomed = zoomCrop(crop, 0.5, 0.25, 0.75, tile);
    expect(zoomed.size).toBe(200);
    expect(zoomed.x0 + 0.25 * zoomed.size).toBeCloseTo(crop.x0 + 0.25 * crop.size);
    expect(zoomed.z0 + 0.75 * zoomed.size).toBeCloseTo(crop.z0 + 0.75 * crop.size);
    expect(zoomCrop(crop, 0.01, 0.5, 0.5, tile).size).toBe(120);
    expect(clampCrop({ x0: 5000, z0: -5000, size: 300 }, tile)).toEqual({ x0: tile.width / 2 - 300, z0: -tile.depth / 2, size: 300 });
  });

  it('numbers its layers as layers.js does', () => {
    expect(Object.entries(LAYER).map(([, index]) => LAYERS[index].id)).toEqual(['none', 'slope', 'rock', 'outcrop', 'radio', 'exposure', 'zone']);
  });

  it('uses the terrain shader colours and slope limits, with the caution band where the table asks', () => {
    expect(marsColour(0)).toEqual([0.068, 0.042, 0.021]);
    expect(layerColour(LAYER.TERRAIN, { slope: 10 })[3]).toBe(0);
    expect(layerColour(LAYER.TERRAIN, { slope: 20 }).slice(0, 3)).toEqual([0.95, 0.6, 0.1]);
    expect(layerColour(LAYER.TERRAIN, { slope: 30 }).slice(0, 3)).toEqual([0.9, 0.08, 0.05]);
    expect(layerColour(LAYER.TERRAIN, { slope: 13 })[3]).toBe(0);
    expect(layerColour(LAYER.TERRAIN, { slope: 13 }, { cautionDeg: 12 }).slice(0, 3)).toEqual([0.95, 0.6, 0.1]);   // cautious risk
    expect(layerColour(LAYER.TERRAIN, { slope: 19 }, { cautionDeg: 20 })[3]).toBe(0);   // bold: no caution band
  });

  it('colours rocks from the abundance it is given, and the table-only layers from their grids', () => {
    expect(layerColour(LAYER.ROCK, { rock: 0.08 }).slice(0, 3)).toEqual(layerColour(LAYER.ROCK, { rock: 0 }).slice(0, 3));
    layerColour(LAYER.ROCK, { rock: 1 }).slice(0, 3).forEach((value, k) => expect(value).toBeCloseTo([1, 0.75, 0.1][k], 6));
    expect(layerColour(LAYER.OUTCROP, { mask: 0 })[3]).toBe(0);
    expect(layerColour(LAYER.OUTCROP, { mask: 1 })[3]).toBeCloseTo(0.6);
    // bare ground almost clear, rocky ground strongly tinted, so the photo still reads under the layer
    expect(layerColour(LAYER.ROCK, { rock: 0.1 })[3]).toBeLessThan(0.1);
    expect(layerColour(LAYER.ROCK, { rock: 1 })[3]).toBeCloseTo(0.65, 6);
    expect(layerColour(LAYER.RADIO, { shadow: false })[3]).toBe(0);
    // the shadow is the legend swatch's #5b8fbf in linear light, strong enough to read blue over the orange image
    const [r, g, b, a] = layerColour(LAYER.RADIO, { shadow: true });
    expect(b).toBeGreaterThan(g); expect(g).toBeGreaterThan(r); expect(a).toBeGreaterThanOrEqual(0.75);
    expect(layerColour(LAYER.EXPOSURE, { sky: null })[3]).toBe(0);   // grid not loaded yet: nothing drawn
    const range = { skyRange: { min: 0.82, max: 1 } };   // the ramp spans the grid's own range
    const open = layerColour(LAYER.EXPOSURE, { sky: 1 }, range);
    const sheltered = layerColour(LAYER.EXPOSURE, { sky: 0.82 }, range);
    open.slice(0, 3).forEach((value, k) => expect(value).toBeCloseTo([0.9, 0.2, 0.1][k], 6));   // the red end of the ramp: open sky, the most dose
    sheltered.slice(0, 3).forEach((value, k) => expect(value).toBeCloseTo([0.1, 0.3, 0.9][k], 6));
    expect(layerColour(LAYER.EXPOSURE, { sky: 0.5 }, range).slice(0, 3)).toEqual(sheltered.slice(0, 3));   // clamped to the range
  });

  it('reads the photo bilinearly, so a map zoomed in on a short route stays smooth', () => {
    const image = { w: 2, h: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255]) };   // black west, white east
    expect(sampleRed(image, 0.25, 0.5)).toBe(0);    // the centre of the west pixel
    expect(sampleRed(image, 0.75, 0.5)).toBe(1);    // the centre of the east pixel
    expect(sampleRed(image, 0.5, 0.5)).toBeCloseTo(0.5, 6);   // halfway
    expect(sampleRed(image, -1, 2)).toBe(0);        // clamped at the edge
  });

  it('opens a tag to the other side of its symbol near the edge it would run off', () => {
    expect([10, 60, 69, 71, 95].map((u) => tagFlips(u))).toEqual([false, false, false, true, true]);
    expect([5, 17, 19, 60].map((u) => tagFlips(u, 'left'))).toEqual([true, true, false, false]);   // the rover pin
  });

  it('draws a contour line only near a multiple of 5 m', () => {
    expect(contourLine(10, 30, 1)).toBeCloseTo(1, 6);
    expect(contourLine(12.5, 30, 1)).toBe(0);
    expect(contourLine(10.2, 30, 1)).toBeGreaterThan(0);   // within about 1.5 pixels of the line at 1 m per pixel
    expect(contourLine(10.2, 30, 0.05)).toBe(0);           // zoomed in, the same 0.2 m is many pixels away
    expect(contourLine(12.5, 0, 1)).toBe(0);               // flat ground: no division by zero
  });

  it('measures slope on the height grid and paints every pixel', () => {
    const n = 3;
    const heights = new Float32Array([0, 1, 2, 0, 1, 2, 0, 1, 2]);   // rises 1 m per 1 m to the east
    const slopes = slopeGrid({ n, width: 2, depth: 2, heights });
    expect(slopes[4]).toBeCloseTo(45, 5);
    const terrain = { n, width: 2, depth: 2, heights, range: 2, density: new Uint8Array(1), densityN: 1 };
    for (const layer of Object.values(LAYER)) {
      const out = paintMap(new Uint8ClampedArray(4 * 4 * 4), 4, { x0: -1, z0: -1, size: 2 }, layer, { ortho, mask: null, terrain, slopes });
      expect(alpha(out).every((a) => a === 255)).toBe(true);
    }
  });

  it('paints rocks from the planner density grid, not from the image brightness', () => {
    // west half of the density grid bare (byte 0), east half rocky (255); the image is one grey everywhere
    const terrain = terrainOf(5, 40, () => 0, (c) => (c < 2 ? 0 : 255));
    const slopes = slopeGrid(terrain);
    const out = paintMap(new Uint8ClampedArray(8 * 8 * 4), 8, { x0: -20, z0: -20, size: 40 }, LAYER.ROCK, { ortho, mask: null, terrain, slopes });
    const west = pixel(out, 8, 1, 4);
    const east = pixel(out, 8, 6, 4);
    expect(east[0]).toBeGreaterThan(west[0]);   // rocky ground towards the yellow end
    expect(west[2]).toBeGreaterThan(east[2]);   // bare ground towards the blue end
  });

  it('paints the radio shadow behind a ridge and leaves the rest of the ground clear', () => {
    // a 30 m wall at x = 0 hides the east half from a mast in the west
    const n = 41;
    const terrain = terrainOf(n, 80, (i) => (i === 20 ? 30 : 0));
    const slopes = slopeGrid(terrain);
    const radio = radioShadowMask(terrain, { x: -30, y: 3, z: 0 }, 4);
    const size = 16;
    const plain = paintMap(new Uint8ClampedArray(size * size * 4), size, { x0: -40, z0: -40, size: 80 }, LAYER.IMAGE, { ortho, mask: null, terrain, slopes });
    const out = paintMap(new Uint8ClampedArray(size * size * 4), size, { x0: -40, z0: -40, size: 80 }, LAYER.RADIO, { ortho, mask: null, terrain, slopes, radio });
    expect(pixel(out, size, 3, 8)).toEqual(pixel(plain, size, 3, 8));         // in sight of the mast: untouched
    expect(pixel(out, size, 13, 8)).not.toEqual(pixel(plain, size, 13, 8));   // behind the wall: tinted
    // without a mast there is no mask, and the layer leaves the image as it is
    const none = paintMap(new Uint8ClampedArray(size * size * 4), size, { x0: -40, z0: -40, size: 80 }, LAYER.RADIO, { ortho, mask: null, terrain, slopes });
    expect([...none]).toEqual([...plain]);
  });

  it('paints the sky view where the grid is loaded', () => {
    const terrain = terrainOf(5, 40, () => 0);
    const slopes = slopeGrid(terrain);
    const sky = { n: 2, width: 40, depth: 40, values: new Float32Array([0.81, 1, 0.81, 1]), min: 0.81, max: 1 };
    const size = 8;
    const out = paintMap(new Uint8ClampedArray(size * size * 4), size, { x0: -20, z0: -20, size: 40 }, LAYER.EXPOSURE, { ortho, mask: null, terrain, slopes, sky });
    expect(pixel(out, size, 0, 4)[2]).toBeGreaterThan(pixel(out, size, 7, 4)[2]);   // sheltered west: blue end
    expect(pixel(out, size, 7, 4)[0]).toBeGreaterThan(pixel(out, size, 0, 4)[0]);   // open east: red end
  });

  it('adds the 5 m contours to the Terrain layer', () => {
    // a walkable ramp to the east, 1 m every 10 m (6 degrees): a contour every 50 m, at pixels 4.5, 9.5... of 10 m each
    const n = 41;
    const terrain = terrainOf(n, 400, (i) => i);
    const slopes = slopeGrid(terrain);
    const size = 40;
    const crop = { x0: -200, z0: -200, size: 400 };
    const plain = paintMap(new Uint8ClampedArray(size * size * 4), size, crop, LAYER.IMAGE, { ortho, mask: null, terrain, slopes });
    const out = paintMap(new Uint8ClampedArray(size * size * 4), size, crop, LAYER.TERRAIN, { ortho, mask: null, terrain, slopes });
    const brighter = (px) => pixel(out, size, px, 20)[0] - pixel(plain, size, px, 20)[0];
    expect(brighter(4)).toBeGreaterThan(20);   // beside the 5 m contour
    expect(brighter(7)).toBe(0);               // halfway between contours, walkable ground: clear
  });

  it('marks the candidate stops the route does not visit on Outcrop, with why', () => {
    const candidates = routeStopCandidates(readJson('public/data/stops.json'));
    expect(candidates.map((c) => c.id).sort()).toEqual(['bright-angel', 'cheyava-falls', 'sortie']);
    // the Cheyava Falls objective kept Cheyava Falls and dropped Bright Angel for time; the sortie belongs to another goal
    const places = layerPlaces(LAYER.OUTCROP, {
      candidates,
      stops: [{ id: 'cheyava-falls' }],
      dropped: [{ id: 'bright-angel', limit: 'time' }],
      waypoints: [{ name: 'HAB' }, { name: 'Cheyava Falls' }],
    });
    expect(places.map((p) => [p.id, p.kind, p.detail])).toEqual([
      ['bright-angel', 'candidate', 'dropped: over your time'],
      ['sortie', 'candidate', 'another objective'],
    ]);
    expect(places[0].label).toBe('Bright Angel');
    expect(places[0].title).toBe('Bright Angel: dropped: over your time');
    // a stop the route visits under its waypoint name (route.json anchors, no plan yet) is not marked twice
    expect(layerPlaces(LAYER.OUTCROP, { candidates, waypoints: [{ name: 'WP3 · Bright Angel outcrop' }] }).map((p) => p.id)).not.toContain('bright-angel');
    expect(layerPlaces(LAYER.OUTCROP, { candidates, dropped: [{ id: 'sortie', limit: 'odd' }] }).find((p) => p.id === 'sortie').detail).toBe('dropped: no route');
    setLanguage('es');
    expect(layerPlaces(LAYER.OUTCROP, { candidates }).find((p) => p.id === 'sortie')).toMatchObject({ label: 'Zona de tono claro', detail: 'otro objetivo' });
  });

  it('marks the sampling task places off the route on Rocks and Outcrop, and why each was left out (#352)', () => {
    const candidates = routeStopCandidates(readJson('public/data/stops.json'));
    const tasks = [
      { id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } },
      { id: 't2', what: 'photo', count: 2, place: { type: 'stop', stopId: 'cheyava-falls' } },
      { id: 't3', what: 'soil', count: 3, place: { type: 'point', id: 'P1', x: 560, z: 574 } },
    ];
    const waypoints = [{ name: 'HAB' }, { name: 'WP3 · Bright Angel outcrop', place: 'bright-angel', tasks: ['t1'] }];
    const planTasks = [{ id: 't1', what: 'rock', count: 1, kept: true }, { id: 't2', what: 'photo', count: 2, kept: false, drop: { limit: 'o2' } }, { id: 't3', what: 'soil', count: 3, kept: false, drop: null }];
    // Bright Angel is on the route: its stop marker names the task, so it gets no second mark
    expect(layerPlaces(LAYER.ROCK, { candidates, tasks, planTasks, waypoints })).toEqual([
      { id: 'task-cheyava-falls', kind: 'task', x: 0, z: 0, label: 'Photo ×2', detail: 'dropped: O2 margin', title: 'Cheyava Falls: Photo ×2: dropped: O2 margin', opens: 'left' },
      { id: 'task-P1', kind: 'task', x: 560, z: 574, label: 'Soil ×3', detail: '', title: 'P1: Soil ×3', opens: 'left' },
    ]);
    expect(waypointTaskTag(LAYER.ROCK, waypoints[1], planTasks)).toBe('Rock ×1');
    expect(waypointTaskTag(LAYER.OUTCROP, { tasks: ['t1', 't2'] }, [{ ...planTasks[0] }, { ...planTasks[1], kept: true }])).toBe('Rock ×1 · Photo ×2');
    expect(waypointTaskTag(LAYER.TERRAIN, waypoints[1], planTasks)).toBeNull();
    expect(waypointTaskTag(LAYER.ROCK, waypoints[0], planTasks)).toBeNull();
    // on Outcrop a task place off the route takes the place of its stop's candidate mark; the other candidates stay
    expect(layerPlaces(LAYER.OUTCROP, { candidates, tasks, planTasks, waypoints }).map((p) => p.id)).toEqual(['sortie', 'task-cheyava-falls', 'task-P1']);
    // no tasks (any goal but Collect samples): the layers mark what they did before
    expect(layerPlaces(LAYER.ROCK, { candidates })).toEqual([]);
    expect(layerPlaces(LAYER.OUTCROP, { candidates }).map((p) => p.id)).toEqual(['bright-angel', 'cheyava-falls', 'sortie']);
    expect(layerPlaces(LAYER.TERRAIN, { candidates, tasks })).toEqual([]);
    setLanguage('es');
    expect(layerPlaces(LAYER.ROCK, { candidates, tasks: tasks.slice(0, 1) })[0].label).toBe('Roca ×1');
  });

  it('turns a click on the map back into metres', () => {
    const crop = { x0: 400, z0: 500, size: 150 };
    expect(fromMap(0, 0, crop)).toEqual({ x: 400, z: 500 });
    expect(fromMap(50, 100, crop)).toEqual({ x: 475, z: 650 });
    const [u, v] = toMap(523.4, 611.2, crop);
    const back = fromMap(u, v, crop);
    expect(back.x).toBeCloseTo(523.4, 9);
    expect(back.z).toBeCloseTo(611.2, 9);
  });

  it('marks the natural shelters on Exposure with the sky they hide, and nothing on the other layers', () => {
    const { shelters } = readJson('public/data/shelters.json');
    const places = layerPlaces(LAYER.EXPOSURE, { shelters });
    expect(places.map((p) => p.id)).toEqual(['SP1', 'SP2', 'SP3', 'SP4']);   // the habitat is the route's first marker
    expect(places[0].label).toMatch(/^SP1 · 1[56] % sky hidden$/);   // short: the sky, not the dose; the title gives the dose bound
    expect(places.every((p) => p.opens === 'left')).toBe(true);
    // the dose cut is a SIM upper bound, beside what RAD measured (#296)
    expect(places[0].title).toMatch(/sky view 0\.8\d, the terrain hides 1[56] % of the sky\. .*at most 1[56] % \(SIM, an upper bound from geometry\)\. RAD measured 4 % less dose/);
    setLanguage('es');
    expect(layerPlaces(LAYER.EXPOSURE, { shelters })[0].label).toMatch(/^SP1 · 1[56] % de cielo oculto$/);
    for (const layer of [LAYER.IMAGE, LAYER.TERRAIN, LAYER.ROCK, LAYER.RADIO]) expect(layerPlaces(layer, { shelters })).toEqual([]);
  });

  it('words the exposure readout, with the dose share it implies', () => {
    expect(exposureText(null)).toBeNull();
    expect(exposureText({ mean: 0.934, min: 0.881 })).toEqual({
      label: 'Sky exposure on the route',
      value: '0.93 mean · 0.88 at its most sheltered',
      note: 'If the dose scaled with sky view, this route would get about 93 % of the open-ground dose in a solar particle event, an upper bound on the saving (SIM). RAD measured only 4 % less dose with 19 % of the sky blocked.',
    });
    setLanguage('es');
    expect(exposureText({ mean: 0.934, min: 0.881 }).value).toBe('0,93 de media · 0,88 en su punto más resguardado');
  });
});
