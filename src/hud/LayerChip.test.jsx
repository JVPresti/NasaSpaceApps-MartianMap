import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import { LAYERS, layerMeta } from '../plan/layers.js';
import { resetStore, setLayer, useMissionStore } from '../state/store.js';
import LayerChip, { legendText } from './LayerChip.jsx';

vi.mock('./layerChip.css', () => ({}));
// Render the current store snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => { setLanguage('en'); resetStore(); });

const render = () => renderToStaticMarkup(<LayerChip />);

describe('LayerChip', () => {
  it('renders nothing while no layer is on', () => {
    expect(useMissionStore.getState().view.layer).toBe(0);
    expect(render()).toBe('');
  });

  it('names every layer and shows its legend colours from layers.js', () => {
    for (const meta of LAYERS.filter((l) => l.index > 0)) {
      setLayer(meta.index);
      const html = render();
      expect(html).toContain(meta.name);
      for (const s of meta.swatches) expect(html).toContain(`background:${s.color}`);
      if (meta.gradient) expect(html).toContain(meta.gradient.join(', '));
    }
  });

  it('reads the slope legend aloud with its limits', () => {
    expect(legendText(layerMeta(1))).toBe('0–15° walkable, 15–25° caution, >25° no-go');
    setLayer(1);
    expect(render()).toContain('aria-label="Data layer Slope hazard, legend: 0–15° walkable, 15–25° caution, &gt;25° no-go. Press 0 to turn it off."');
  });

  it('reads a gradient legend once, with the unit from its labels', () => {
    expect(legendText(layerMeta(2))).toBe('0 m–221 m, Contours every 5 m');
  });

  it('follows the interface language', () => {
    setLayer(1);
    setLanguage('es');
    expect(render()).toContain('Capa de datos');
  });
});
