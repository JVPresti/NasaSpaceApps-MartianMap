import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PRELOAD_FONTS, PRELOAD_IMAGES, preloadAppAssets, preloadImageUrls } from './preload.js';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const stops = JSON.parse(read('../public/data/stops.json')).stops;

/** Every @font-face in fonts.css, as the FontFaceSet.load() string the preload must use. */
function fontFaces() {
  const css = read('./fonts.css');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, block]) => {
    const family = block.match(/font-family:\s*'([^']+)'/)[1];
    const weight = block.match(/font-weight:\s*(\d+)/)[1];
    return `${weight} 16px ${family.includes(' ') ? `"${family}"` : family}`;
  });
}

describe('preload list (#266)', () => {
  it('covers every interface font face', () => {
    expect(new Set(PRELOAD_FONTS)).toEqual(new Set(fontFaces()));
    expect(PRELOAD_FONTS.length).toBe(fontFaces().length);
  });

  it('includes the hazard art, the visor art and every science stop photo', () => {
    const urls = preloadImageUrls(stops);

    for (const name of ['hazard_dust', 'hazard_oxygen', 'hazard_radiation', 'visor_bezel', 'visor_ring']) {
      expect(urls.some((url) => url.includes(name)), name).toBe(true);
    }
    const photos = stops.flatMap((stop) => stop.images.map((image) => image.file));
    expect(photos.length).toBeGreaterThan(0);
    for (const file of photos) expect(urls.some((url) => url.endsWith('data/' + file)), file).toBe(true);
    expect(urls).toHaveLength(new Set(urls).size);
  });

  it('requests every URL and font face, and settles even when one of each fails', async () => {
    const requested = [];
    const fonts = { load: vi.fn((font) => (font.includes('IBM') ? Promise.reject(new Error('missing')) : Promise.resolve())) };
    const createImage = () => {
      const image = {};
      Object.defineProperty(image, 'src', {
        set(value) {
          requested.push(value);
          queueMicrotask(() => image.onerror?.());
        },
      });
      return image;
    };

    const result = await preloadAppAssets({ stops: [{ images: [{ file: 'images/only.jpg' }] }], fonts, createImage });

    expect(requested).toEqual(expect.arrayContaining([...PRELOAD_IMAGES, '/data/images/only.jpg']));
    expect(fonts.load.mock.calls.map(([font]) => font)).toEqual(PRELOAD_FONTS);
    expect(result.images).toHaveLength(PRELOAD_IMAGES.length + 1);
    expect(result.fonts).toEqual(PRELOAD_FONTS);
  });

  it('never rejects when the image or font API is missing', async () => {
    const createImage = () => { throw new Error('no image'); };
    const fonts = { load: () => { throw new Error('no fonts'); } };

    await expect(preloadAppAssets({ stops: [], fonts, createImage })).resolves.toEqual({ images: PRELOAD_IMAGES, fonts: PRELOAD_FONTS });
  });
});
