// What the wrist screen shows (#67): one flat model per page, built only from the page's own state so
// `JSON.stringify` is a stable redraw signature. A change to the suit while the checklist is open, or to the
// checklist while the layers are open, leaves the signature untouched.
//
// Plain JavaScript, no React, no three.js, no DOM. Page and row selection are arguments; this module never
// creates a store or an engine API, and it never ticks a checklist item by itself.
import { provenance, TAGS } from '../../data/provenance.js';
import { CHECKLIST } from '../../hud/samplingPrompt.js';
import { formatMinutes, formatValue } from '../../hud/format.js';
import { t } from '../../i18n/index.js';
import { LAYERS } from '../../plan/layers.js';
import { clampRow, PAGE_TITLES, PAGES, rowCount } from './layout.js';

const DASH = '–';
const LEVELS = ['nominal', 'caution', 'warning'];

/**
 * @typedef {Object} WristRow
 * @property {string} label  large text
 * @property {string} value  formatted already; '–' when the store has no value
 * @property {'DATA' | 'DERIVED' | 'SIM'} [tag]  source tag, only where the data declares one
 * @property {boolean} [active]  layers: this row is `store.view.layer`
 * @property {boolean} [checked] checklist: this row is ticked in `store.sampling.checklist`
 */

/**
 * @typedef {Object} WristModel
 * @property {'layers' | 'map' | 'checklist' | 'suit'} page
 * @property {number} pageIndex  0-based index in PAGES
 * @property {number} pageCount  PAGES.length
 * @property {number} row        clamped row selection; drawn as a highlight, independent of `active`
 * @property {string} title      PAGE_TITLES[page]
 * @property {string | null} status  short line in the header, null when the page has none
 * @property {'nominal' | 'caution' | 'warning' | null} level  colour for `status`
 * @property {boolean} confirmable  Enter selects a layer; on the other pages the rows are read-only
 * @property {WristRow[]} rows   at most five; empty on the map page, which the map owner paints
 */

/** Tag declared by a layer's catalog source line ("DATA · ..."): no source is invented here. */
function catalogTag(layer) {
  const match = /^(DATA|DERIVED|SIM)\b/.exec(layer?.source ?? '');
  return match ? match[1] : undefined;
}

/** Tag from the live store sources, falling back to the declared provenance entry. */
function tagFor(state, path) {
  const live = state?.sources?.[path] ?? null;
  const entry = provenance.resolve(path, live);
  return entry && TAGS.includes(entry.tag) ? entry.tag : undefined;
}

/** Keep the model key order fixed: label, value, then the optional flags. */
function makeRow(label, value, { tag, active, checked } = {}) {
  const out = { label, value };
  if (tag) out.tag = tag;
  if (active !== undefined) out.active = active;
  if (checked !== undefined) out.checked = checked;
  return out;
}

function activeLayerIndex(state) {
  const raw = state?.view?.layer;
  const index = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return Math.max(0, Math.min(LAYERS.length - 1, index));
}

function layersContent(state) {
  const active = activeLayerIndex(state);
  const rows = LAYERS.map((layer, index) => makeRow(layer.name, layer.unit, {
    tag: catalogTag(layer),
    active: index === active,
  }));
  return { status: LAYERS[active].name.toUpperCase(), level: null, rows };
}

function checklistContent(state) {
  const checklist = state?.sampling?.checklist ?? {};
  const rows = CHECKLIST.map((item) => makeRow(item.label, item.how, { checked: checklist[item.id] === true }));
  const done = rows.filter((row) => row.checked).length;
  return { status: done + '/' + CHECKLIST.length, level: null, rows };
}

/** '82' + ' %', '4.3' + ' psi'; the dash stays bare when the value is unknown. */
function withUnit(value, digits, unit) {
  const text = formatValue(value, digits);
  return Number.isFinite(value) ? text + ' ' + unit : text;
}

/** Minutes with the unit, signed when asked: '+41 min'; the dash stays bare. */
function withMinutes(sec, signed = false) {
  const text = formatMinutes(sec, { signed });
  return Number.isFinite(sec) ? text + t('units.minutesSuffix') : text;
}

function suitContent(state) {
  const suit = state?.suit ?? {};
  const fields = [
    { label: t('wrist.row.o2'), path: 'suit.oxygenPct', value: withUnit(suit.oxygenPct, 0, '%') },
    { label: t('wrist.row.battery'), path: 'suit.batteryPct', value: withUnit(suit.batteryPct, 0, '%') },
    { label: t('wrist.row.pressure'), path: 'suit.pressurePsi', value: withUnit(suit.pressurePsi, 1, t('ui.psi')) },
    { label: t('wrist.row.o2time'), path: 'suit.oxygenSec', value: withMinutes(suit.oxygenSec) },
    { label: t('wrist.row.margin'), path: 'suit.marginSec', value: withMinutes(suit.marginSec, true) },
  ];
  const rows = fields.map((field) => makeRow(field.label, field.value, { tag: tagFor(state, field.path) }));
  const status = LEVELS.includes(suit.status) ? suit.status : null;
  return { status: status ? t('wrist.status.' + status) : DASH, level: status, rows };
}

/**
 * The visible content of one wrist page.
 * @param {object} state mission store snapshot (or a partial object in tests)
 * @param {'layers' | 'map' | 'checklist' | 'suit'} page
 * @param {number} [row] selected row; clamped to the page
 * @returns {WristModel}
 */
export function wristView(state, page, row = 0) {
  const safePage = PAGES.includes(page) ? page : PAGES[0];
  const count = rowCount(safePage);
  const base = {
    page: safePage,
    pageIndex: PAGES.indexOf(safePage),
    pageCount: PAGES.length,
    row: clampRow(row, count),
    title: PAGE_TITLES[safePage],
    status: null,
    level: null,
    confirmable: safePage === 'layers',
    rows: [],
  };
  // The map has no rows and no status: the map owner paints its content over the frame. No store value
  // from an inactive page enters the model.
  const content = safePage === 'layers' ? layersContent(state)
    : safePage === 'checklist' ? checklistContent(state)
      : safePage === 'suit' ? suitContent(state)
        : null;
  return content ? { ...base, ...content } : base;
}
