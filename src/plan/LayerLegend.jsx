import { layerDecides, layerLegendTitle, legendRows } from './tableLayers.js';

/**
 * The key of the layer shown on the mission table map, in the map's bottom-left corner (.table-map-legend): its
 * swatches or colour ramp from layers.js, then one line on what the layer decides when layers.js says. Nothing for a
 * layer with neither, such as the plain image.
 * @param {{ layer: object }} props an entry of LAYERS (src/plan/layers.js)
 */
export default function LayerLegend({ layer }) {
  if (!layer) return null;
  const rows = legendRows(layer);
  const decides = layerDecides(layer);
  if (rows.length === 0 && !decides) return null;
  return (
    <div className="table-map-legend">
      <p>{layerLegendTitle(layer)}</p>
      {rows.length > 0 && (
        <ul>
          {rows.map((row) => (
            <li key={row.key}>
              <i className={row.gradient ? 'sw-ramp' : undefined} style={row.gradient ? { background: row.gradient } : row.color ? { background: row.color } : undefined} />
              {row.text}
            </li>
          ))}
        </ul>
      )}
      {decides && <p className="table-map-decides">{decides}</p>}
    </div>
  );
}
