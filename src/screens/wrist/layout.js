// Wrist screen geometry (#67): fixed pixel frame, page order and the row targets the selection uses.
// The screen is a fixed 512 × 352 texture; coordinates are texture pixels, independent of display DPR.
// Plain JavaScript, no React, no three.js, no DOM.
import { t } from '../../i18n/index.js';
import { WALK_LAYERS } from '../../plan/layers.js';

/** Logical canvas size in CSS pixels. */
export const WRIST_WIDTH = 512;
export const WRIST_HEIGHT = 352;

/** Page order in the wrist carousel, toggled with [ and ]. */
export const PAGES = Object.freeze(['layers', 'map', 'checklist', 'suit']);

/** Page titles, uppercase as the rest of the interface, resolved from the language catalog. */
export const PAGE_TITLES = Object.freeze({
  get layers() { return t('wrist.page.layers'); },
  get map() { return t('wrist.page.map'); },
  get checklist() { return t('wrist.page.checklist'); },
  get suit() { return t('wrist.page.suit'); },
});

/** Top and bottom of the row band, and the footer baseline (pixels). */
export const ROWS_TOP = 74;
export const ROWS_BOTTOM = 314;
export const FOOTER_Y = 336;

/** Area inside the frame that belongs to the page content. The map page paints into this rect. */
export const WRIST_CONTENT = Object.freeze({ x: 24, y: ROWS_TOP, w: WRIST_WIDTH - 48, h: ROWS_BOTTOM - ROWS_TOP });

const ROW_COUNTS = Object.freeze({ layers: WALK_LAYERS.length, map: 1, checklist: 4, suit: 5 });

/**
 * Number of selectable rows on a page: the layers the ground draws in Walk (four: none, terrain, rocks, outcrop;
 * the table-only layers are not listed), one map, the four checklist items, the five suit readouts.
 * @param {'layers' | 'map' | 'checklist' | 'suit'} page
 * @returns {number}
 */
export function rowCount(page) {
  if (!PAGES.includes(page)) throw new Error('unknown wrist page: ' + page);
  return ROW_COUNTS[page];
}

/**
 * A pixel point inside a row, used by the selection: the centre of the row's touch band.
 * Rows are clamped to the page so a stored selection never points outside it.
 * @param {'layers' | 'map' | 'checklist' | 'suit'} page
 * @param {number} row
 * @returns {{ x: number, y: number }}
 */
export function rowTarget(page, row) {
  const count = rowCount(page);
  const index = clampRow(row, count);
  const height = (ROWS_BOTTOM - ROWS_TOP) / count;
  // Point at the row's right edge so the glove does not cover the label being read.
  return { x: WRIST_WIDTH - 28, y: ROWS_TOP + (index + 0.5) * height };
}

/** Clamp a row selection into [0, count - 1]. Non-integers and missing values fall back to 0. */
export function clampRow(row, count) {
  const n = Number.isFinite(row) ? Math.trunc(row) : 0;
  return Math.max(0, Math.min(count - 1, n));
}
