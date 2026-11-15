import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { LAYERS } from './layers.js';
import { layerButtonText, layerDecides, layerLegendTitle, layerMapTitle, legendRows } from './tableLayers.js';

afterEach(() => setLanguage('en'));

const byId = (id) => LAYERS.find((layer) => layer.id === id);

describe('mission table layer text', () => {
  it('words every layer of layers.js on its button and map caption', () => {
    for (const layer of LAYERS) {
      expect(layerButtonText(layer)).not.toMatch(/^table\./);
      expect(layerMapTitle(layer)).not.toMatch(/^table\./);
    }
    expect(layerButtonText(byId('none'))).toBe('Image');
    expect(layerMapTitle(byId('slope'))).toBe('Route over the slope layer');
  });

  it('falls back to the layer name and summary for a layer the table has no words for', () => {
    const layer = { id: 'exposure-test', name: 'Sky exposure', summary: 'Open sky over each cell' };
    expect(layerButtonText(layer)).toBe('Sky exposure');
    expect(layerMapTitle(layer)).toBe('Open sky over each cell');
    expect(layerLegendTitle(layer)).toBe('Sky exposure');
  });

  it('translates what a layer decides, and gives nothing without the field', () => {
    expect(layerDecides({ id: 'x', decides: 'table.layer.slope' })).toBe('Slope');
    expect(layerDecides({ id: 'x' })).toBeNull();
    expect(layerDecides({ id: 'x', decides: '' })).toBeNull();
  });

  it('builds the slope legend from the layers.js swatches, the walkable band clear as the table map draws it', () => {
    const rows = legendRows(byId('slope'));
    expect(rows.map((row) => row.text)).toEqual(['0–15° · walkable', '15–20° · caution', '>20° · no-go']);
    expect(rows[0].color).toBeNull();
    expect(rows[1].color).toBe('#f2991a');
    expect(rows[2].color).toBe('#e6140d');
  });

  it('gives a colour ramp its end labels', () => {
    const [ramp] = legendRows({ id: 'rock', gradient: ['#263399', '#ffbf1a'], minLabel: '0.08', maxLabel: '1.0' });
    expect(ramp.gradient).toBe('linear-gradient(90deg, #263399, #ffbf1a)');
    expect(ramp.text).toBe('0.08 – 1.0');
  });

  it('honours a swatch marked clear', () => {
    const rows = legendRows({ id: 'radio', swatches: [{ color: '#000', label: 'In sight', clear: true }, { color: '#123', label: 'Shadow' }] });
    expect(rows.map((row) => row.color)).toEqual([null, '#123']);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    expect(layerButtonText(byId('rock'))).toBe('Rocas');
    expect(layerLegendTitle(byId('slope'))).toBe('Pendiente, del modelo de elevación HiRISE');
  });
});
