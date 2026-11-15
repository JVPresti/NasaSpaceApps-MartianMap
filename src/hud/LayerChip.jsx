import { t } from '../i18n/index.js';
// Active data layer chip (#201). A layer picked in Plan, or with L, Shift+L or 0, stays on in Walk and paints the
// terrain; this chip names it and repeats its legend from src/plan/layers.js, so the colours read as data. Hidden
// while no layer is on (index 0).
import { useMissionStore } from '../state/store.js';
import { layerMeta } from '../plan/layers.js';
import { legendText } from './layerLegend.js';
import './layerChip.css';

export default function LayerChip() {
  const layer = useMissionStore((s) => s.view.layer);
  if (!layer) return null;
  const meta = layerMeta(layer);
  if (meta.index === 0) return null;
  return (
    <section
      className="hud-panel hud-layer"
      aria-label={t('ui.layer.chip.label', { name: meta.name, legend: legendText(meta) })}
      title={meta.source}
    >
      <div className="hud-layer-head">
        <span className="hud-layer-kicker">{t('ui.data.layer')}</span>
        <b>{meta.name}</b>
        <span className="hud-layer-key"><kbd>0</kbd>{t('ui.layer.chip.off')}</span>
      </div>
      <div className="hud-layer-legend" aria-hidden="true">
        {meta.gradient && (
          <span className="hud-layer-range">
            <small>{meta.minLabel}</small>
            <i className="hud-layer-gradient" style={{ background: `linear-gradient(90deg, ${meta.gradient.join(', ')})` }} />
            <small>{meta.maxLabel}</small>
          </span>
        )}
        {meta.swatches?.map((s) => (
          <span key={s.label} className="hud-layer-swatch">
            <i style={{ background: s.color }} />{s.label}{s.detail && <small>{s.detail}</small>}
          </span>
        ))}
      </div>
    </section>
  );
}
