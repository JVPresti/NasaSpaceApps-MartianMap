/**
 * Preview images of the map layers (#51), shown beside the mission table's layer buttons.
 *
 * One WebP per layer of `layers.js`, painted by the table map's own painter
 * (mapLayers.js paintMap) with `npm run previews` (scripts/build-layer-previews.mjs):
 * the same view of the full EVA route for every layer, no route, standard risk.
 * The table-only layers (radio shadow, exposure) have no 3D look to render, so
 * the table's look is the one shown. Re-run the script whenever a layer's look changes.
 */

export const PREVIEW_DIR = 'marswalk/previews';
export const PREVIEW_WIDTH = 480;
export const PREVIEW_HEIGHT = 300;
export const PREVIEW_MAX_BYTES = 50 * 1024;

/**
 * @param {{ id: string, name: string }} layer an entry of LAYERS
 * @param {string} [base] the app's base URL (import.meta.env.BASE_URL in the app)
 * @returns {{ src: string, alt: string, width: number, height: number }}
 */
export function layerPreview(layer, base = '/') {
  return {
    src: `${base}${PREVIEW_DIR}/${layer.id}.webp`,
    alt: `${layer.name} layer over the site, seen from above`,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  };
}
