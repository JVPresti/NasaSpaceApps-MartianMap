import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import ControlsHelp from './ControlsHelp.jsx';

afterEach(() => setLanguage('en'));

// Each <dt> holds the key label; reading them back checks the help against the real bindings (#199).
const keyLabels = () => [...renderToStaticMarkup(<ControlsHelp />).matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);

describe('ControlsHelp', () => {
  it('lists the sampling, layer, sources, partner and slope grid keys', () => {
    const labels = keyLabels();
    for (const key of ['Click', 'P', 'E', 'F', 'M', 'L / Shift+L', '0', 'C', 'T', 'G']) expect(labels).toContain(key);
  });

  it('groups Walk, Sampling, Plan and Both views in either language', () => {
    expect(renderToStaticMarkup(<ControlsHelp />).match(/<h3>[^<]*<\/h3>/g)).toEqual(['<h3>Walk</h3>', '<h3>Sampling</h3>', '<h3>Plan</h3>', '<h3>Both views</h3>']);
    setLanguage('es');
    const html = renderToStaticMarkup(<ControlsHelp />);
    expect(html).toContain('Muestreo');
    expect(html).toContain('Ambas vistas');
    expect(html).not.toContain('menu.help.');
  });
});
