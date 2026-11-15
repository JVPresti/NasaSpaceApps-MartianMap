// The start screen is the first screen (#266). While the visitor reads it, the files that would otherwise load
// only when a later screen opens are fetched here: the hazard illustrations, the visor art, every interface font
// face and the science stop photos. App calls preloadAppAssets() once, so the mission table, the cards and the
// EVA open without waiting. A failure here is silent on purpose: it is an optimisation, and the screens that
// really need a file still report their own errors.
import hazardDust from './assets/ui/hazard_dust.webp';
import hazardOxygen from './assets/ui/hazard_oxygen.webp';
import hazardRadiation from './assets/ui/hazard_radiation.webp';
import visorBezel from './assets/ui/visor_bezel.webp';
import visorRing from './assets/ui/visor_ring.webp';
import { imageUrl, loadStops } from './data/stops.js';

/** Images only referenced from a screen opened after the start screen. */
export const PRELOAD_IMAGES = [hazardDust, hazardOxygen, hazardRadiation, visorBezel, visorRing];

/**
 * Every @font-face in src/fonts.css, in the FontFaceSet.load() syntax. The Walk HUD has no @font-face of its own,
 * so this is all of them.
 */
export const PRELOAD_FONTS = [
  '400 16px Barlow',
  '500 16px Barlow',
  '600 16px Barlow',
  '500 16px "Barlow Condensed"',
  '600 16px "Barlow Condensed"',
  '400 16px "IBM Plex Mono"',
  '500 16px "IBM Plex Mono"',
];

/**
 * Every image URL to fetch behind the start screen: the hazard and visor art plus each science stop photo.
 * @param {Array<object>} stops entries of stops.json
 * @returns {string[]} unique URLs
 */
export function preloadImageUrls(stops = []) {
  const photos = stops.flatMap((stop) => (Array.isArray(stop?.images) ? stop.images : [])
    .filter((image) => image?.file)
    .map((image) => imageUrl(image)));
  return [...new Set([...PRELOAD_IMAGES, ...photos])];
}

function loadImage(url, createImage) {
  return new Promise((resolve) => {
    try {
      const image = createImage();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = url;
    } catch {
      resolve();
    }
  });
}

function loadFont(fonts, font) {
  try {
    const request = fonts?.load?.(font);
    if (request && typeof request.catch === 'function') request.catch(() => {});
    return Promise.resolve(request);
  } catch {
    return Promise.resolve();
  }
}

/**
 * Fetch the late images and font faces in the background. Resolves after every request settles; never rejects,
 * because a missing preview must not stop the opening or hide the scene's own load error.
 * @param {{ stops?: Array<object>, fonts?: object, createImage?: () => object }} [options]
 *   stops: the parsed stops.json, for callers that already have it; otherwise it is loaded here.
 *   fonts: the FontFaceSet (document.fonts by default).
 *   createImage: the image constructor, injectable for tests.
 * @returns {Promise<{ images: string[], fonts: string[] }>}
 */
export async function preloadAppAssets({ stops, fonts = globalThis.document?.fonts, createImage = () => new globalThis.Image() } = {}) {
  let list = Array.isArray(stops) ? stops : [];
  if (!Array.isArray(stops)) {
    try {
      list = await loadStops();
    } catch {
      // The mission table loads stops.json for real and reports a failure there.
      list = [];
    }
  }
  const images = preloadImageUrls(list);
  await Promise.allSettled([
    ...images.map((url) => loadImage(url, createImage)),
    ...PRELOAD_FONTS.map((font) => loadFont(fonts, font)),
  ]);
  return { images, fonts: PRELOAD_FONTS };
}
