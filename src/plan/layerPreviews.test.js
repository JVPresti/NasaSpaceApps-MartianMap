import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYERS } from './layers.js';
import { layerPreview, PREVIEW_DIR, PREVIEW_HEIGHT, PREVIEW_MAX_BYTES, PREVIEW_WIDTH } from './layerPreviews.js';

const file = (layer) => join(process.cwd(), 'public', PREVIEW_DIR, layer.id + '.webp');

// width and height from a WebP header: lossy (VP8), lossless (VP8L) or extended (VP8X)
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error('unknown WebP chunk ' + chunk);
}

describe('layer previews (#51)', () => {
  it('has one image per layer, all the same size and under the size limit', () => {
    for (const layer of LAYERS) {
      expect(statSync(file(layer)).size).toBeLessThan(PREVIEW_MAX_BYTES);
      expect(webpSize(readFileSync(file(layer)))).toEqual({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });
    }
  });
  it('points each layer to its image under the app base URL', () => {
    expect(layerPreview(LAYERS[1], '/base/')).toEqual({
      src: `/base/${PREVIEW_DIR}/${LAYERS[1].id}.webp`,
      alt: `${LAYERS[1].name} layer over the site, seen from above`,
      width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT,
    });
  });
});
