import { useEffect, useMemo, useState } from 'react';
import { loadDataFile } from '../data/dataFiles.js';
import { provenance } from '../data/provenance.js';
import { formatNumber, t } from '../i18n/index.js';
import { decodeSkyViewGrid, skyViewAlongPath, SKY_VIEW_PATH } from '../sim/skyView.js';

// The radiation readout of the Exposure layer (docs/data/map-layers-decision.md): how open the sky is along the
// planned route, from the sky view grid that `npm run skyview` precomputes (public/data/sky_view.json). The sky view of
// the whole tile takes about 15 s to compute, so the app only reads that 84 KB file, once, and samples it along the
// route in well under a millisecond (skyView.skyViewAlongPath).
//
// Placed on the table by the table's own components: `useRouteExposure(route.path)` gives the numbers,
// `exposureText(readout)` the words, and <SourceTag path="route.exposure" requireSource={false} /> the tag.

provenance.define({
  'route.exposure': {
    tag: 'DERIVED',
    label: 'HiRISE DTM · sky view',
    source: 'mean sky view along the planned route, sampled every 5 m on the 6 m sky view grid of public/data/sky_view.json '
      + '(src/sim/skyView.js, method in docs/route/shelters.md). Under an isotropic SEP flux the dose scales with it, so 1 - mean '
      + 'is an upper bound on the saving against open ground. On this tile sky view spans only about 0.81 to 1.0.',
  },
});

let request = null;

/** The decoded sky view grid, loaded once and shared (the Exposure layer of the table map reads it too). */
export function loadSkyView() {
  request ??= loadDataFile(SKY_VIEW_PATH).then(decodeSkyViewGrid);
  request.catch(() => { request = null; });
  return request;
}

/** The sky view grid once it has loaded; null before, and null if the file cannot be read. */
export function useSkyView(enabled = true) {
  const [sky, setSky] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadSkyView().then((grid) => { if (alive) setSky(grid); }, (error) => {
      console.warn('sky_view.json could not be loaded; the Exposure layer and its readout are off.', error);
    });
    return () => { alive = false; };
  }, [enabled]);
  return sky;
}

/**
 * The exposure readout of a route: skyView.skyViewAlongPath on the shared grid. Null until the grid loads, and null
 * without a route.
 * @param {Array<[number, number]> | null} path route.path
 * @returns {{ lengthM: number, mean: number, min: number, max: number, lowest: { x: number, z: number } } | null}
 */
export function useRouteExposure(path) {
  const sky = useSkyView(Array.isArray(path) && path.length > 1);
  return useMemo(() => (sky ? skyViewAlongPath(sky, path) : null), [sky, path]);
}

/**
 * The words of the readout in the interface language, for example "0.93 mean · 0.88 at its most sheltered" and the
 * dose line under it.
 * @param {{ mean: number, min: number } | null} readout
 * @returns {{ label: string, value: string, note: string } | null}
 */
export function exposureText(readout) {
  if (!readout) return null;
  return {
    label: t('layers.exposure.readout'),
    value: t('layers.exposure.readout.value', { mean: formatNumber(readout.mean, 2), min: formatNumber(readout.min, 2) }),
    note: t('layers.exposure.readout.note', { pct: Math.round(readout.mean * 100) }),
  };
}
