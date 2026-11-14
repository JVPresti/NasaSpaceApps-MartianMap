import { useEffect, useState } from 'react';
import { loadStops } from '../data/stops.js';
import { registerStops } from './content.js';

let cached = null;

/** stops.json, fetched once per page and added to the provenance registry. Returns [] until it loads, and [] if it fails. */
export function useStops() {
  const [stops, setStops] = useState([]);
  useEffect(() => {
    let alive = true;
    cached ??= loadStops().then((list) => registerStops(list) && list).catch((error) => {
      console.warn('stops.json could not be loaded; science stop cards are off.', error);
      return [];
    });
    cached.then((list) => { if (alive) setStops(list); });
    return () => { alive = false; };
  }, []);
  return stops;
}
