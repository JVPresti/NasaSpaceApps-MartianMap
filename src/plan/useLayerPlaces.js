import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { loadDataFile } from '../data/dataFiles.js';
import { routeStopCandidates, STOPS_PATH } from '../data/stops.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { useMissionStore } from '../state/store.js';
import { LAYER, layerPlaces } from './mapLayers.js';

// The places some layers mark on the table map (mapLayers.layerPlaces), for MissionMap to frame and LayerPlaces.jsx to
// draw. Data: public/data/stops.json and shelters.json through the shared loader, so they are the copies the planner
// and the minimap already have; the store gives the stops the plan kept and dropped.

const optional = (path) => loadDataFile(path).catch(() => null);
const NONE = [];

/**
 * The places the layer marks: candidate stops on Outcrop, natural shelters on Exposure; none on the other layers.
 * @param {number} layer
 * @returns {Array<{ id: string, kind: string, x: number, z: number, label: string, detail: string, title: string }>}
 */
export function useLayerPlaces(layer) {
  const wanted = layer === LAYER.OUTCROP || layer === LAYER.EXPOSURE;
  const [files, setFiles] = useState({ stops: null, shelters: null });
  const route = useMissionStore(useShallow((s) => ({ stops: s.route.stops, dropped: s.route.dropped, waypoints: s.route.waypoints })));

  useEffect(() => {
    if (!wanted) return undefined;
    let alive = true;
    Promise.all([optional(STOPS_PATH), optional(SHELTERS_PATH)]).then(([stops, shelters]) => {
      if (alive) setFiles({ stops, shelters });
    });
    return () => { alive = false; };
  }, [wanted]);

  return useMemo(() => {
    if (!wanted) return NONE;
    let candidates = [];
    try { candidates = files.stops ? routeStopCandidates(files.stops) : []; } catch { candidates = []; }
    return layerPlaces(layer, { candidates, stops: route.stops ?? [], dropped: route.dropped ?? [], waypoints: route.waypoints ?? [], shelters: files.shelters?.shelters ?? [] });
  }, [wanted, layer, files, route]);
}
