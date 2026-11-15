import { useEffect, useMemo, useRef, useState } from 'react';
import { imageUrl } from '../data/stops.js';
import { groupImages, loadTraverse } from '../data/traverse.js';
import { t } from '../i18n/index.js';
import { useStops } from '../stops/useStops.js';
import { tagFlips, toMap } from './mapLayers.js';
import SourceTag from './SourceTag.jsx';
import { usePlacedPopup } from './usePlacedPopup.js';

// Perseverance on the mission table map (#249): the drives the rover made across the tile, under our route, and a pin
// where it stood to take the stop images, which opens them. A second NASA mission on the map, beside the MRO HiRISE
// layers. Data: public/data/traverse.json (scripts/build-traverse.mjs); image details come from stops.json.

let request = null;
function useTraverse() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    request ??= loadTraverse().catch((error) => {
      console.warn('traverse.json could not be loaded; the map shows no Perseverance drives.', error);
      request = null;
      return null;
    });
    request.then((value) => { if (alive) setData(value); });
    return () => { alive = false; };
  }, []);
  return data;
}

const points = (list, crop) => list.map(([x, z]) => toMap(x, z, crop).map((v) => v.toFixed(2)).join(',')).join(' ');

/**
 * @param {{ crop: { x0: number, z0: number, size: number } }} props the map's current view, as in MissionMap
 */
export default function TraverseLayer({ crop }) {
  const data = useTraverse();
  const stops = useStops();
  const [open, setOpen] = useState(null);   // index of the pin whose images are open
  const [shown, setShown] = useState(0);    // image shown in the open pin
  // placed like the stop details, beside the pin and clear of the map's chrome (#380)
  const anchor = useRef(null);
  const [popRef, popStyle] = usePlacedPopup(() => anchor.current?.querySelector(`[data-pin="${open}"]`), [open, crop]);

  const pins = useMemo(() => {
    if (!data) return [];
    const details = new Map(stops.flatMap((s) => s.images ?? []).map((image) => [image.file, image]));
    return groupImages(data.images.map((image) => ({ ...image, detail: details.get(image.file) ?? null })));
  }, [data, stops]);

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!data) return null;
  const pin = open !== null ? pins[open] : null;
  const image = pin?.images[Math.min(shown, pin.images.length - 1)] ?? null;
  const detail = image?.detail;

  return (
    <>
      <svg className="table-map-traverse" viewBox="0 0 100 100" aria-hidden="true">
        {data.drives.map((drive, k) => <polyline key={k} points={points(drive.points, crop)} className="map-traverse-shadow" />)}
        {data.drives.map((drive, k) => <polyline key={k} points={points(drive.points, crop)} className="map-traverse" />)}
      </svg>
      <div className="map-pins" ref={anchor}>
        {pins.map((p, k) => {
          const [u, v] = toMap(p.x, p.z, crop);
          if (u < -5 || u > 105 || v < -5 || v > 105) return null;
          return (
            <div key={k} className={tagFlips(u, 'left') ? 'map-pin flip' : 'map-pin'} style={{ left: `${u}%`, top: `${v}%` }}>
              <span className="map-pin-dot" aria-hidden="true" />
              <button
                type="button"
                className="map-pin-hit"
                data-pin={k}
                aria-expanded={open === k}
                aria-label={t('map.images.pin.label', { n: p.images.length })}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => { setShown(0); setOpen(open === k ? null : k); }}
              >
                <svg className="map-pin-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h3l1.5-2h3L11 5h3v8H2z" /><circle cx="8" cy="9" r="2.5" /></svg>
                {t('map.images.pin', { n: p.images.length })}
              </button>
            </div>
          );
        })}
        {pin && image && (() => {
          return (
            <div className="map-pop map-pop-images" ref={popRef} style={popStyle} role="dialog" aria-label={t('map.images.title')} onPointerDown={(event) => event.stopPropagation()}>
              <div className="map-pop-head">
                <div><b>{t('map.images.title')}</b><span>{t('map.images.rover.stop', { rmc: image.rmc })} <SourceTag path="map.imagePins" requireSource={false} source={{ tag: image.tag, label: image.label, source: image.provenance?.note?.replace(/\.$/, '') }} /></span></div>
                <button type="button" className="map-pop-close" aria-label={t('map.images.close')} onClick={() => setOpen(null)}>×</button>
              </div>
              <figure className="map-pop-figure">
                <a href={imageUrl(image)} target="_blank" rel="noreferrer">
                  <img src={imageUrl(image)} alt={detail?.alt ?? image.image_id} width={detail?.width_px} height={detail?.height_px} />
                </a>
                <figcaption>
                  <b>{t('map.images.caption', { camera: image.camera, sol: image.sol })}</b>
                  <span>{image.image_id}{detail?.credit ? ` · ${t('map.images.credit', { credit: detail.credit })}` : ''}</span>
                </figcaption>
              </figure>
              {pin.images.length > 1 && (
                <div className="map-pop-switch" role="group" aria-label={t('map.images.title')}>
                  {pin.images.map((item, i) => (
                    <button key={item.file} type="button" aria-pressed={item === image} aria-label={t('map.images.n.of.m', { n: i + 1, m: pin.images.length })} onClick={() => setShown(i)}>
                      <img src={imageUrl(item)} alt="" />
                    </button>
                  ))}
                </div>
              )}
              {detail?.original_url && (
                <a className="map-pop-link" href={detail.original_url} target="_blank" rel="noreferrer">{t('map.images.original')}</a>
              )}
            </div>
          );
        })()}
      </div>
      {/* The key says what the drives decide: a cautious crew's route prefers ground the rover crossed (missionNeeds.js) */}
      <p className="table-map-traverse-key">
        <i aria-hidden="true" />
        <span>
          {t('map.traverse.key', { from: data.sols[0], to: data.sols[1] })}
          <small>{t('layers.traverse.prefer')}</small>
        </span>
        <SourceTag path="map.traverse" requireSource={false} source={null} />
      </p>
    </>
  );
}
