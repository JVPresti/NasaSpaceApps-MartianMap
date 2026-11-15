import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/index.js';
import LayerLegend from './LayerLegend.jsx';
import { LAYERS } from './layers.js';

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

  it('adds what the layer decides as one caption line', () => {
    const html = render({ id: 'none', name: 'None', decides: 'table.layer.slope.title' });
    expect(html).toContain('class="table-map-decides"');
    expect(text(html)).toContain('HiRISE image');
    expect(text(html)).toContain(t('table.layer.slope.title'));
  });
});
