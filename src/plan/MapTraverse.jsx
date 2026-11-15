import { useEffect, useMemo, useState } from 'react';
import { imageUrl } from '../data/stops.js';
import { photoGroups } from '../data/traverse.js';
import { t } from '../i18n/index.js';
import { useStops } from '../stops/useStops.js';
import { toMap } from './mapLayers.js';
import SourceTag from './SourceTag.jsx';

// Perseverance on the mission table map (#249): the rover's drives across the tile as a thin line under the route,
// and a camera pin where the rover stood for the Perseverance images on the stop cards. The data is
// public/data/traverse.json (scripts/build-traverse.mjs, from the Mars 2020 MMGIS layers). Every position is DATA.

const stopPointer = (event) => event.stopPropagation();

/**
 * The drives as one SVG path in the map's 0-100 frame. Drawn under the route, which stays the thing to follow.
 * @param {{ traverse: object | null, crop: { x0: number, z0: number, size: number } }} props
 */
export function TraverseLayer({ traverse, crop }) {
  if (!traverse?.drives.length) return null;
  const d = traverse.drives
    .map((drive) => drive.path.map(([x, z], k) => `${k ? 'L' : 'M'}${toMap(x, z, crop).map((v) => v.toFixed(2)).join(' ')}`).join(''))
    .join('');
  return (
    <svg className="table-map-marks map-traverse-layer" viewBox="0 0 100 100" aria-hidden="true">
      <path d={d} className="map-traverse-casing" />
      <path d={d} className="map-traverse" />
    </svg>
  );
}

/** Key in the map's lower right corner: what the white line is, with its DATA tag. */
export function TraverseKey({ traverse }) {
  if (!traverse?.sols) return null;
  return (
    <p className="map-traverse-key" onPointerDown={stopPointer}>
      <i aria-hidden="true" />
      {t('traverse.key', { from: traverse.sols[0], to: traverse.sols[1] })}
      <SourceTag path="map.traverse" requireSource={false} />
    </p>
  );
}

/** Image entries of stops.json by file, for the caption, credit and size of each photo. */
function imagesByFile(stops) {
  const out = new Map();
  for (const stop of stops) for (const image of stop.images ?? []) if (image?.file) out.set(image.file, image);
  return out;
}

/**
 * Camera pins: one per place, offset from the point with a leader so the stop marker under it stays readable. A pin
 * opens the photos taken there; each opens full size in a new tab.
 * @param {{ traverse: object | null, crop: { x0: number, z0: number, size: number } }} props
 */
export function PhotoPins({ traverse, crop }) {
  const stops = useStops();
  const images = useMemo(() => imagesByFile(stops), [stops]);
  const groups = useMemo(() => photoGroups((traverse?.photos ?? []).filter((p) => images.has(p.file))), [traverse, images]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!groups.length) return null;
  const group = open !== null ? groups[open] : null;

  return (
    <>
      <ul className="map-photos">
        {groups.map((g, k) => {
          const [u, v] = toMap(g.x, g.z, crop);
          if (u < -5 || u > 105 || v < -5 || v > 105) return null;
          return (
            <li key={k} className="map-photo" style={{ left: `${u}%`, top: `${v}%` }}>
              <i className="map-photo-dot" aria-hidden="true" />
              <i className="map-photo-lead" aria-hidden="true" />
              <button
                type="button"
                className="map-photo-hit"
                aria-expanded={open === k}
                aria-label={t('traverse.photos.open', { count: g.photos.length })}
                title={t('traverse.photos.open', { count: g.photos.length })}
                onPointerDown={stopPointer}
                onClick={() => setOpen(open === k ? null : k)}
              >
                <svg viewBox="0 0 20 16" aria-hidden="true"><path d="M2 4h4l1.5-2h5L14 4h4v10H2z" /><circle cx="10" cy="9" r="3" /></svg>
                <b>{g.photos.length}</b>
              </button>
            </li>
          );
        })}
      </ul>
      {group && (() => {
        const [u, v] = toMap(group.x, group.z, crop);
        const style = { left: u > 55 ? undefined : `calc(${u}% + 18px)`, right: u > 55 ? `calc(${100 - u}% + 18px)` : undefined, top: `clamp(8px, calc(${v}% - 60px), calc(100% - 420px))` };
        return (
          <div className="map-pop map-photo-pop" style={style} role="dialog" aria-label={t('traverse.photos.title')} onPointerDown={stopPointer}>
            <div className="map-pop-head">
              <div><b>{t('traverse.photos.title')}</b><span>{t('traverse.photos.where')}</span></div>
              <button type="button" className="map-pop-close" aria-label={t('traverse.photos.close')} onClick={() => setOpen(null)}>×</button>
            </div>
            <ul className="map-photo-list">
              {group.photos.map((photo) => {
                const image = images.get(photo.file);
                return (
                  <li key={photo.file}>
                    <a href={imageUrl(image)} target="_blank" rel="noreferrer" title={t('traverse.photos.full')}>
                      <img src={imageUrl(image)} alt={image.alt ?? image.caption ?? ''} width={image.width_px} height={image.height_px} loading="lazy" />
                    </a>
                    <div>
                      <p>{image.caption}</p>
                      <small>{image.credit} · {t('traverse.photos.rover', { sol: photo.rover.sol ?? photo.sol, rmc: photo.rover.rmc ?? '–' })}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="map-photo-source">{t('traverse.photos.source')}<SourceTag path="map.traverse" requireSource={false} /></p>
          </div>
        );
      })()}
    </>
  );
}
