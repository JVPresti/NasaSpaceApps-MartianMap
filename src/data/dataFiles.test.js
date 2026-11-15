import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCostGrid, loadDataFile, loadJsonUrl, resetDataFiles, TERRAIN_PATH } from './dataFiles.js';

const ok = (data) => ({ ok: true, status: 200, json: async () => data });

// A 3 x 3 terrain.json, flat, in the shipped format (heights as base64 little-endian uint16).
function tinyTerrain() {
  const heights = btoa(String.fromCharCode(...new Uint8Array(new Uint16Array(9).buffer)));
  const density = btoa(String.fromCharCode(0, 0, 0, 0));
  return { n: 3, width_m: 2, depth_m: 2, range_m: 1, heights_u16_b64: heights, density_n: 2, density_u8_b64: density };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetDataFiles();
});

describe('loadJsonUrl', () => {
  it('fetches a file once for any number of callers and returns the same object', async () => {
    const fetchMock = vi.fn(async () => ok({ a: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([loadDataFile('data/hazards.json', '/'), loadJsonUrl('/data/hazards.json')]);
    const third = await loadDataFile('data/hazards.json', '/');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('names the file in HTTP and JSON errors and fetches again after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(loadDataFile('data/shelters.json', '/')).rejects.toThrow('shelters.json 404');

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } })));
    await expect(loadDataFile('data/shelters.json', '/')).rejects.toThrow('shelters.json: invalid JSON');

    vi.stubGlobal('fetch', vi.fn(async () => ok({ shelters: [] })));
    await expect(loadDataFile('data/shelters.json', '/')).resolves.toEqual({ shelters: [] });
  });

  it('starts the request synchronously', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    loadDataFile('data/stops.json', '/');
    expect(fetchMock).toHaveBeenCalledWith('/data/stops.json');
  });
});

describe('loadCostGrid', () => {
  it('decodes terrain.json once and shares the grid', async () => {
    const fetchMock = vi.fn(async () => ok(tinyTerrain()));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([loadCostGrid(), loadCostGrid()]);
    await loadDataFile(TERRAIN_PATH);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(a.n).toBe(3);
  });
});
