import { tagFlips, toMap } from './mapLayers.js';

// The places some layers mark on the table map (mapLayers.layerPlaces, useLayerPlaces.js): the candidate stops the
// route does not visit on Outcrop, with why, and the natural shelters on Exposure, with the sky they hide. Same tags as the
// stop markers, a smaller symbol, so they never read as a stop of the route. They sit above the rover's image pin: on
// these two layers the places are what the layer shows. Styles: mapLayers.css.

/** A place's tag opens to the left (class flip) on its default side, or away from the map edge it would run off. */
const opensLeft = (place, u) => (place.opens === 'left' ? !tagFlips(u, 'left') : tagFlips(u));

/**
 * @param {{ places: Array<{ id: string, kind: string, x: number, z: number, label: string, detail: string, title: string,
 *   opens: 'right' | 'left' }>, crop: { x0: number, z0: number, size: number } }} props places: useLayerPlaces; crop: the
 *   map's current view
 */
export default function LayerPlaces({ places, crop }) {
  if (places.length === 0) return null;
  return (
    <ul className="map-markers map-places">
      {places.map((p) => {
        const [u, v] = toMap(p.x, p.z, crop);
        if (u < -5 || u > 105 || v < -5 || v > 105) return null;
        return (
          <li key={p.id} className={'map-place map-place-' + p.kind + (opensLeft(p, u) ? ' flip' : '')} style={{ left: `${u}%`, top: `${v}%` }} title={p.title}>
            <i aria-hidden="true" />
            <span className="map-marker-tag"><b>{p.label}</b>{p.detail && <small>{p.detail}</small>}</span>
          </li>
        );
      })}
    </ul>
  );
}
