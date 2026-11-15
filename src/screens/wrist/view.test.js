import { describe, expect, it } from 'vitest';
import { CHECKLIST } from '../../hud/samplingPrompt.js';
import { LAYERS } from '../../plan/layers.js';
import { createInitialState } from '../../state/store.js';
import { PAGES } from './layout.js';
import { wristView } from './view.js';

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
    status: 'caution',
    ...overrides,
  };
  return state;
}

describe('wristView', () => {
  it('shows the real layer catalog, the active layer and the row selection independently', () => {
    const state = createInitialState();
    state.view = { ...state.view, layer: 3 };

    const model = wristView(state, 'layers', 0);
    expect(model.rows.map((row) => row.label)).toEqual(LAYERS.map((layer) => layer.name));
    expect(model.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[3].name]);
    expect(model.rows[0].active).toBe(false);
    expect(model.confirmable).toBe(true);

    const otherRow = wristView(state, 'layers', 4);
    expect(otherRow.row).toBe(4);
    expect(otherRow.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[3].name]);
    expect(JSON.stringify(otherRow)).not.toBe(JSON.stringify(model));

    state.view = { ...state.view, layer: 1 };
    const otherLayer = wristView(state, 'layers', 0);
    expect(otherLayer.rows.filter((row) => row.active).map((row) => row.label)).toEqual([LAYERS[1].name]);
    expect(JSON.stringify(otherLayer)).not.toBe(JSON.stringify(model));
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

    expect(model.rows.map((row) => row.label)).toEqual(['O2', 'BATTERY', 'PRESSURE', 'O2 TIME', 'MARGIN']);
    expect(rows.O2.value).toBe('82 %');
    expect(rows.BATTERY.value).toBe('61 %');
    expect(rows.PRESSURE.value).toBe('4.3 psi');
    expect(rows['O2 TIME'].value).toBe('132 min');
    expect(rows.MARGIN.value).toBe('+41 min');
    expect(rows.O2.tag).toBe('DERIVED');
    expect(rows.BATTERY.tag).toBe('DERIVED');
    expect(rows.PRESSURE.tag).toBe('DATA');
    expect(rows['O2 TIME'].tag).toBe('DERIVED');
    expect(rows.MARGIN.tag).toBe('DERIVED');
    expect(model.status).toBe('CAUTION');
    expect(model.level).toBe('caution');
    expect(model.confirmable).toBe(false);
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
