import { LAYERS, layerMeta } from './layers.js';

function LayerLegend({ meta }) {
  return (
    <div className="layer-legend" aria-live="polite">
      <div className="legend-head">
        <span>{meta.name}</span>
        <span className="legend-unit">{meta.unit}</span>
      </div>

      {meta.gradient && (
        <>
          <div
            className="legend-gradient"
            style={{ background: `linear-gradient(90deg, ${meta.gradient.join(', ')})` }}
          />
          <div className="legend-range">
            <span>{meta.minLabel}</span>
            <span>{meta.maxLabel}</span>
          </div>
        </>
      )}

      {meta.swatches?.length > 0 && (
        <ul className="legend-swatches">
          {meta.swatches.map((swatch) => (
            <li key={swatch.label}>
              <span className="legend-swatch" style={{ background: swatch.color }} />
              <span className="legend-label">{swatch.label}</span>
              {swatch.detail && <span className="legend-detail">{swatch.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="legend-summary">{meta.summary}</p>
      <p className="legend-source">{meta.source}</p>
    </div>
  );
}

/**
 * Layer switch and its legend. The index is the engine's `uLayer` value.
 * @param {{ layer: number, onLayer: (index: number) => void }} props
 */
export default function LayerPanel({ layer, onLayer }) {
  const meta = layerMeta(layer);

  return (
    <aside className="plan-panel" aria-label="Plan mode layers and waypoints">
      <header className="plan-panel-head">
        <h2>Map layers</h2>
        <p className="plan-panel-source">Cheyava Falls</p>
      </header>

      <section className="plan-section">
        <h3>Data layer</h3>
        <div className="layer-list" role="group" aria-label="Terrain data layer">
          {LAYERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={layer === item.index}
              className={layer === item.index ? 'on' : undefined}
              onClick={() => onLayer(item.index)}
            >
              <span className="layer-index">{item.index || '—'}</span>
              <span className="layer-name">{item.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="plan-section">
        <h3>Legend</h3>
        <LayerLegend meta={meta} />
      </section>

      <footer className="plan-panel-foot">
        <span>Tile 1422 × 1500 m</span>
        <span>HiRISE DTM 1 m · ortho 25 cm</span>
      </footer>
    </aside>
  );
}
