import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/index.js';
import { resetStore, useMissionStore } from '../state/store.js';
import LayerLegend from './LayerLegend.jsx';
import { LAYERS } from './layers.js';

// Render the store as a test sets it (Zustand's server render otherwise uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore) };
});

afterEach(() => resetStore());

const render = (layer) => renderToStaticMarkup(<LayerLegend layer={layer} />);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('layer legend on the mission table map', () => {
  it('shows the slope bands from layers.js under the table heading', () => {
    const html = render(LAYERS.find((layer) => layer.id === 'slope'));
    expect(html).toContain('class="table-map-legend"');
    expect(text(html)).toContain(t('table.layer.slope.legend'));
    expect(text(html)).toMatch(/&gt;20° · /);
    expect(html).toContain('background:#e6140d');
  });

  it('renders nothing for a layer with no swatches and nothing it decides', () => {
    expect(render({ id: 'none', name: 'None', summary: 'Photo' })).toBe('');
  });

  it('names the task places on Rocks and Outcrop only while the goal is Collect samples with a task (#352)', () => {
    const rock = LAYERS.find((layer) => layer.id === 'rock');
    const outcrop = LAYERS.find((layer) => layer.id === 'outcrop');
    const tasks = [{ id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } }];
    expect(render(rock)).not.toContain('Task place');
    useMissionStore.setState((s) => ({ needs: { ...s.needs, objective: 'samples', tasks } }));
    expect(text(render(rock))).toContain('Task place · what the crew collects there');
    expect(render(outcrop)).toContain('background:#ff6a2b');
    expect(render(LAYERS.find((layer) => layer.id === 'slope'))).not.toContain('Task place');
    useMissionStore.setState((s) => ({ needs: { ...s.needs, objective: 'sortie' } }));
    expect(render(rock)).not.toContain('Task place');
  });

  it('adds what the layer decides as one caption line', () => {
    const html = render({ id: 'none', name: 'None', decides: 'table.layer.slope.title' });
    expect(html).toContain('class="table-map-decides"');
    expect(text(html)).toContain('HiRISE image');
    expect(text(html)).toContain(t('table.layer.slope.title'));
  });
});

describe('layer legend source tags (realism rule)', () => {
  it('tags every layer that has a provenance in layers.js', () => {
    for (const layer of LAYERS.filter((entry) => entry.provenance)) {
      const html = render(layer);
      if (!html) continue;   // a layer with no legend rows and nothing it decides draws no legend
      expect(html, layer.id).toMatch(new RegExp(`src-tag-${layer.provenance.tag.toLowerCase()}`));
    }
    expect(render(LAYERS.find((layer) => layer.id === 'rock'))).toMatch(/src-tag-/);
    expect(render(LAYERS.find((layer) => layer.id === 'outcrop'))).toMatch(/src-tag-/);
  });
});
