import { useMissionStore } from '../state/store.js';
import { layerProvenancePath } from './layers.js';
import { useSkyView } from './routeExposure.js';
import SourceTag from './SourceTag.jsx';
import { layerDecides, layerLegendTitle, legendRows } from './tableLayers.js';

// Every layer's DATA / DERIVED / SIM tag beside its legend title (the realism rule): the provenance layers.js keeps
// and registers for each layer (layerProvenancePath).

/**
 * The key of the layer shown on the mission table map, in the map's bottom-left corner (.table-map-legend): its
 * swatches or colour ramp from layers.js, then one line on what the layer decides when layers.js says. Nothing for a
 * layer with neither, such as the plain image. It follows the crew's risk setting (Terrain's caution band) and the
 * sky view grid once it has loaded (Exposure's range), as the map does.
 * @param {{ layer: object }} props an entry of LAYERS (src/plan/layers.js)
 */
export default function LayerLegend({ layer }) {
  const risk = useMissionStore((s) => s.needs?.risk);
  const sky = useSkyView(layer?.id === 'exposure');
  if (!layer) return null;
  const rows = legendRows(layer, { risk, sky });
  const decides = layerDecides(layer);
  if (rows.length === 0 && !decides) return null;
  return (
    <div className="table-map-legend">
      <p>{layerLegendTitle(layer)}{layer.provenance && <SourceTag path={layerProvenancePath(layer)} requireSource={false} />}</p>
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
