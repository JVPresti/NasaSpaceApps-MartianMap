import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import ControlsHelp from './ControlsHelp.jsx';

afterEach(() => setLanguage('en'));

// Each <dt> holds the key label; reading them back checks the help against the real bindings (#199).
const keyLabels = () => [...renderToStaticMarkup(<ControlsHelp />).matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);

describe('ControlsHelp', () => {
  it('lists the sampling, layer, sources, find, partner, slope grid and wrist keys', () => {
    const labels = keyLabels();
    for (const key of ['Click', 'P', 'E', 'F', 'M', 'L / Shift+L', '0', 'C', 'Q (hold 2 s)', 'Y / N', 'T', 'G', 'R']) expect(labels).toContain(key);
  });

  it('lays the groups out in three columns in either language', () => {
    const html = renderToStaticMarkup(<ControlsHelp />);
    expect(html.match(/class="controls-column"/g)).toHaveLength(3);
    expect(html.match(/<h3>[^<]*<\/h3>/g)).toEqual(['<h3>Walk</h3>', '<h3>Plan</h3>', '<h3>Sampling</h3>', '<h3>Both views</h3>', '<h3>Finds and panels</h3>']);
    setLanguage('es');
    const spanish = renderToStaticMarkup(<ControlsHelp />);
    expect(spanish).toContain('Muestreo');
    expect(spanish).toContain('Ambas vistas');
    expect(spanish).not.toContain('menu.help.');
  });
});
