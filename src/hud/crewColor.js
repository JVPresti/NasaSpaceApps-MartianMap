// Crew colours are linear RGB (src/engine/crew.js), for the suit shader. CSS and canvas want sRGB.

const toSrgb = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055));

/** 'rgb(r, g, b)' for a linear RGB triple, or null when it is not one. */
export function crewCss(color) {
  return Array.isArray(color) && color.length === 3 && color.every(Number.isFinite) ? `rgb(${color.map(toSrgb).join(', ')})` : null;
}
