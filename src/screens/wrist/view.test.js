import { afterEach, describe, expect, it } from 'vitest';
import { CHECKLIST } from '../../hud/samplingPrompt.js';
import { setLanguage } from '../../i18n/index.js';
import { LAYERS, WALK_LAYERS } from '../../plan/layers.js';
import { createInitialState } from '../../state/store.js';
import { PAGES, rowCount } from './layout.js';
import { wristView } from './view.js';

afterEach(() => setLanguage('en'));

const signature = (state, page, row = 0) => JSON.stringify(wristView(state, page, row));

function suitState(overrides = {}) {
  const state = createInitialState();
  state.suit = {
    ...state.suit,
    oxygenPct: 82.4,
    batteryPct: 61.2,
    pressurePsi: 4.3,
    oxygenSec: 7_920,
    marginSec: 2_460,
    marginLimit: 'eva',
    status: 'caution',
    ...overrides,
  };
  return state;
}

describe('wristView', () => {
  it('shows the layers the ground draws, the active layer and the row selection independently', () => {
    const state = createInitialState();
    state.view = { ...state.view, layer: 3 };

    const model = wristView(state, 'layers', 0);
    expect(model.rows.map((row) => row.label)).toEqual(WALK_LAYERS.map((layer) => layer.name));
    expect(model.rows).toHaveLength(rowCount('layers'));
    expect(model.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[3].name]);
    expect(model.rows[0].active).toBe(false);
    expect(model.confirmable).toBe(true);

    const otherRow = wristView(state, 'layers', 2);
    expect(otherRow.row).toBe(2);
    expect(otherRow.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[3].name]);
    expect(JSON.stringify(otherRow)).not.toBe(JSON.stringify(model));
    expect(wristView(state, 'layers', 9).row).toBe(rowCount('layers') - 1);

    state.view = { ...state.view, layer: 1 };
    const otherLayer = wristView(state, 'layers', 0);
    expect(otherLayer.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[1].name]);
    expect(JSON.stringify(otherLayer)).not.toBe(JSON.stringify(model));
  });

  it('leaves the table-only layers out and shows none active while one of them is chosen', () => {
    const state = createInitialState();
    for (const layer of LAYERS.filter((l) => !l.walk)) {
      state.view = { ...state.view, layer: layer.index };
      const model = wristView(state, 'layers', 0);
      expect(model.rows.map((row) => row.label)).not.toContain(layer.name);
      expect(model.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[0].name]);
      expect(model.status).toBe(LAYERS[0].name.toUpperCase());
    }
  });

  it('ticks checklist rows only from the real store state', () => {
    const state = createInitialState();
    const before = state.sampling.checklist;

    const untouched = wristView(state, 'checklist', 2);
    expect(untouched.rows.map((row) => row.label)).toEqual(CHECKLIST.map((item) => item.label));
    expect(untouched.rows.every((row) => row.checked === false)).toBe(true);
    expect(untouched.status).toBe('0/4');
    expect(untouched.confirmable).toBe(false);
    expect(state.sampling.checklist).toBe(before);
    expect(untouched.rows[2].checked).toBe(false);

    state.sampling = {
      ...state.sampling,
      checklist: { ...state.sampling.checklist, seal: true },
    };
    const ticked = wristView(state, 'checklist', 3);
    expect(ticked.rows.map((row) => row.checked)).toEqual([false, false, false, true]);
    expect(ticked.status).toBe('1/4');
    expect(JSON.stringify(ticked)).not.toBe(JSON.stringify(untouched));
  });

  it('reads the suit row values and each source tag from the store and provenance', () => {
    const model = wristView(suitState(), 'suit');
    const rows = Object.fromEntries(model.rows.map((row) => [row.label, row]));

    expect(model.rows.map((row) => row.label)).toEqual(['O2', 'BATTERY', 'PRESSURE', 'O2 TIME', 'MARGIN · EVA CLOCK']);
    expect(rows.O2.value).toBe('82 %');
    expect(rows.BATTERY.value).toBe('61 %');
    expect(rows.PRESSURE.value).toBe('4.3 psi');
    expect(rows['O2 TIME'].value).toBe('132 min');
    expect(rows['MARGIN · EVA CLOCK'].value).toBe('+41 min');
    expect(rows.O2.tag).toBe('DERIVED');
    expect(rows.BATTERY.tag).toBe('DERIVED');
    expect(rows.PRESSURE.tag).toBe('DATA');
    expect(rows['O2 TIME'].tag).toBe('DERIVED');
    expect(rows['MARGIN · EVA CLOCK'].tag).toBe('DERIVED');
    expect(model.status).toBe('CAUTION');
    expect(model.level).toBe('caution');
    expect(model.confirmable).toBe(false);
  });

  it('names the limit that sets the margin, and leaves the label plain when the store has none (#323)', () => {
    const label = (marginLimit) => wristView(suitState({ marginLimit }), 'suit').rows[4].label;
    expect(label('eva')).toBe('MARGIN · EVA CLOCK');
    expect(label('o2')).toBe('MARGIN · O2');
    expect(label(null)).toBe('MARGIN');
    expect(label(undefined)).toBe('MARGIN');
  });

  it('formats missing suit values as a dash and reacts to a real suit change', () => {
    const blank = wristView(createInitialState(), 'suit');
    expect(blank.rows.map((row) => row.value)).toEqual(['–', '–', '–', '–', '–']);
    expect(blank.status).toBe('–');
    expect(blank.level).toBe(null);

    const state = suitState();
    const before = signature(state, 'suit');
    state.suit = { ...state.suit, oxygenPct: 50 };
    const after = wristView(state, 'suit');
    expect(after.rows[0].value).toBe('50 %');
    expect(JSON.stringify(after)).not.toBe(before);
  });

  it('keeps the signature of the open page when data on other pages changes', () => {
    const state = suitState();

    const layers = signature(state, 'layers', 2);
    state.sampling = { ...state.sampling, checklist: { ...state.sampling.checklist, photo: true } };
    state.suit = { ...state.suit, oxygenPct: 12, status: 'warning' };
    expect(signature(state, 'layers', 2)).toBe(layers);

    const checklist = signature(state, 'checklist', 1);
    state.view = { ...state.view, layer: 4 };
    state.suit = { ...state.suit, batteryPct: 5 };
    expect(signature(state, 'checklist', 1)).toBe(checklist);

    const suit = signature(state, 'suit', 0);
    state.view = { ...state.view, layer: 2 };
    state.sampling = { ...state.sampling, checklist: { ...state.sampling.checklist, texture: true } };
    expect(signature(state, 'suit', 0)).toBe(suit);
  });

  it('reads the wrist text from the active language catalog (#231)', () => {
    setLanguage('es');
    const suit = wristView(suitState(), 'suit');
    expect(suit.title).toBe('TRAJE');
    expect(suit.rows.map((row) => row.label)).toEqual(['O2', 'BATERÍA', 'PRESIÓN', 'TIEMPO O2', 'MARGEN · RELOJ EVA']);
    expect(suit.status).toBe('PRECAUCIÓN');

    const layers = wristView(createInitialState(), 'layers');
    expect(layers.title).toBe('CAPAS');
    expect(layers.rows[0].label).toBe('Ninguna');
  });

  it('leaves the map page empty for the map owner', () => {
    const state = createInitialState();
    const model = wristView(state, 'map');
    expect(PAGES).toContain('map');
    expect(model.title).toBe('MAP');
    expect(model.rows).toEqual([]);
    expect(model.status).toBe(null);
    expect(model.confirmable).toBe(false);

    const before = JSON.stringify(model);
    state.view = { ...state.view, layer: 2 };
    state.suit = { ...state.suit, oxygenPct: 10 };
    expect(signature(state, 'map')).toBe(before);
  });
});
