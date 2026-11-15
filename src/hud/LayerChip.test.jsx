import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage, t } from '../i18n/index.js';
import { LAYERS, SLOPE_LIMITS, layerMeta } from '../plan/layers.js';
import { resetStore, setLayer, useMissionStore } from '../state/store.js';
import LayerChip from './LayerChip.jsx';
import { legendText } from './layerLegend.js';

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

  it('reads the slope legend aloud with its limits from layers.js', () => {
    const { caution, noGo } = SLOPE_LIMITS;
    const legend = `0–${caution}° ${t('ui.walkable')}, ${caution}–${noGo}° ${t('caution')}, >${noGo}° ${t('walkableNoGo')}`;
    expect(legendText(layerMeta(1))).toBe(legend);
    setLayer(1);
    const label = t('ui.layer.chip.label', { name: layerMeta(1).name, legend });
    expect(render()).toContain(`aria-label="${label.replaceAll('>', '&gt;')}"`);
  });

  it('reads a gradient legend once, with the unit from its labels', () => {
    const meta = layerMeta(2);
    expect(legendText(meta)).toBe(`${meta.minLabel}–${meta.maxLabel}, ${meta.swatches[0].label} ${meta.swatches[0].detail}`);
    expect(legendText(meta)).not.toMatch(/m m\b/);
  });

  it('follows the interface language', () => {
    setLayer(1);
    setLanguage('es');
    expect(render()).toContain('Capa de datos');
  });
});
