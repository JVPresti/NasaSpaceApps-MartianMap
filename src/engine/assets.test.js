import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssets } from './assets.js';
import { createProgressTracker } from './progress.js';
import { AssetLoadError } from './errors.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(expected) {
  const updates = [];
  const tracker = createProgressTracker({ expected, onChange: (progress) => updates.push(progress) });
  return { assets: createAssets('/marswalk/', { tracker }), updates };
}

describe('createAssets', () => {
  it('tracks a successful JSON request by its relative file name', async () => {
    const fetchMock = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => ({ url }) }));
    vi.stubGlobal('fetch', fetchMock);
    const { assets, updates } = setup(['assets/terrain.json']);

    await expect(assets.json('terrain.json')).resolves.toEqual({ url: '/marswalk/assets/terrain.json' });
    expect(updates.at(-1)).toMatchObject({ loaded: 1, failed: 0, total: 1, ratio: 1 });
  });

  it('names the file and HTTP status when an asset request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const { assets, updates } = setup(['assets/terrain.json']);

    const error = await assets.json('terrain.json').catch((err) => err);
    expect(error).toBeInstanceOf(AssetLoadError);
    expect(error.file).toBe('assets/terrain.json');
    expect(error.message).toContain('assets/terrain.json');
    expect(error.message).toContain('404');
    expect(updates.at(-1)).toMatchObject({ loaded: 0, failed: 1, total: 1 });
  });

  it('names the file when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    const { assets } = setup(['assets/ring.json']);

    const error = await assets.json('ring.json').catch((err) => err);
    expect(error).toBeInstanceOf(AssetLoadError);
    expect(error.file).toBe('assets/ring.json');
    expect(error.message).toContain('Failed to fetch');
  });

  it('names the file when the JSON body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));
    const { assets } = setup(['assets/rocks.json']);

    const error = await assets.json('rocks.json').catch((err) => err);
    expect(error).toBeInstanceOf(AssetLoadError);
    expect(error.file).toBe('assets/rocks.json');
    expect(error.message).toContain('invalid JSON');
  });
});
