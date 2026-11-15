import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage, t } from '../i18n/index.js';
import { LAYERS, SLOPE_LIMITS, WALK_LAYERS, layerMeta } from '../plan/layers.js';
import { resetStore, setLayer, setNeeds, useMissionStore } from '../state/store.js';
import LayerChip from './LayerChip.jsx';
import { legendText, walkSwatches } from './layerLegend.js';

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

  it('names every layer the ground draws and shows the legend of what the ground draws', () => {
    for (const meta of WALK_LAYERS.filter((l) => l.index > 0)) {
      setLayer(meta.index);
      const html = render();
      expect(html).toContain(meta.name);
      for (const s of walkSwatches(meta)) expect(html).toContain(`background:${s.color}`);
      if (meta.gradient) expect(html).toContain(meta.gradient.join(', '));
    }
  });

  it('stays hidden for a table-only layer, which leaves the ground plain in Walk', () => {
    for (const meta of LAYERS.filter((l) => !l.walk)) {
      setLayer(meta.index);
      expect(render()).toBe('');
    }
  });

  it('reads the terrain legend aloud with the suit limits from layers.js, whatever the table risk', () => {
    const { caution, noGo } = SLOPE_LIMITS;
    const legend = `0–${caution}° ${t('ui.walkable')}, ${caution}–${noGo}° ${t('caution')}, >${noGo}° ${t('walkableNoGo')}, ${t('ui.contours')} ${t('ui.every.5.m')}`;
    setNeeds({ risk: 'cautious' });   // the table's caution band moves; the ground keeps the suit's 15°
    expect(legendText(layerMeta(1))).toBe(legend);
    setLayer(1);
    const label = t('ui.layer.chip.label', { name: layerMeta(1).name, legend });
    expect(render()).toContain(`aria-label="${label.replaceAll('>', '&gt;')}"`);
    expect(render()).not.toContain('12–20°');
  });

  it('reads a gradient legend once, with the unit from its labels', () => {
    const meta = layerMeta(2);
    expect(legendText(meta)).toBe(`${meta.minLabel}–${meta.maxLabel}`);
    expect(legendText(layerMeta(3))).toBe(`${layerMeta(3).minLabel}–${layerMeta(3).maxLabel}`);   // no table stop markers on the ground
  });

  it('follows the interface language', () => {
    setLayer(1);
    setLanguage('es');
    expect(render()).toContain('Capa de datos');
  });
});
