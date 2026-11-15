import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import ControlsHelp from './ControlsHelp.jsx';

afterEach(() => setLanguage('en'));

// Each <dt> holds the key caps (#11): one <kbd> per key. Reading them back checks the help against the real
// bindings (#199).
const keyCaps = () => [...renderToStaticMarkup(<ControlsHelp />).matchAll(/<kbd>([^<]*)<\/kbd>/g)].map((m) => m[1]);

describe('ControlsHelp', () => {
  it('lists the sampling, layer, sources, find, partner, slope grid and wrist keys, and no Plan / Walk key', () => {
    const caps = keyCaps();
    for (const key of ['Click', 'P', 'E', 'F', 'L', 'Shift', '0', 'C', 'Q', 'Y', 'N', 'T', 'G', 'R', '[ ]', 'J / K', 'Enter']) expect(caps).toContain(key);
    expect(caps).not.toContain('M');   // no Plan / Walk key (habitat-first flow)
    expect(renderToStaticMarkup(<ControlsHelp />)).toContain('Open it, at the table in the habitat');
  });

  it('lists the wrist keys on one row so the start dialog keeps its height (#231)', () => {
    const html = renderToStaticMarkup(<ControlsHelp />);
    expect(html.match(/class="controls-row"/g)).toHaveLength(24);   // 23 + the X end-EVA row (#244); the wrist keys add none
    expect(html).toContain('Wrist screen');
  });

  it('lists the walking and mission table keys', () => {
    const caps = keyCaps();
    for (const key of ['W', 'A', 'S', 'D', 'Arrows', 'Mouse', 'Esc', 'H', 'Scroll', 'Drag', 'Double-click']) expect(caps).toContain(key);
  });

  it('lays the groups out in three columns in either language', () => {
    const html = renderToStaticMarkup(<ControlsHelp />);
    expect(html.match(/class="controls-column"/g)).toHaveLength(3);
    expect(html.match(/<h3>[^<]*<\/h3>/g)).toEqual(['<h3>Walking</h3>', '<h3>Mission table</h3>', '<h3>Sampling, outside</h3>', '<h3>Layers and sources</h3>', '<h3>Finds and panels</h3>']);
    setLanguage('es');
    const spanish = renderToStaticMarkup(<ControlsHelp />);
    expect(spanish).toContain('Muestreo, fuera');
    expect(spanish).toContain('Capas y fuentes');
    expect(spanish).toContain('Mesa de misión');
    expect(spanish).not.toContain('menu.help.');
  });
});
