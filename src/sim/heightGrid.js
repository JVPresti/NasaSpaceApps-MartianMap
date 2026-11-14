// Heightmap tiles store raw unsigned samples. Decoding turns each sample into
// an elevation in metres by applying the tile's vertical scale and datum offset.
export function decodeHeightGrid(rows, { scale = 1, offset = 0 } = {}) {
  return rows.map((row) => row.map((sample) => sample * scale + offset))
}
