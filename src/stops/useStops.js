import { useEffect, useState } from 'react';
import { loadStops } from '../data/stops.js';

let cached = null;

/** stops.json, fetched once per page. Returns [] until it loads, and [] if it fails. */
export function useStops() {
  const [stops, setStops] = useState([]);
  useEffect(() => {
    let alive = true;
    cached ??= loadStops().catch((error) => {
      console.warn('stops.json could not be loaded; science stop cards are off.', error);
      return [];
    });
    cached.then((list) => { if (alive) setStops(list); });
    return () => { alive = false; };
  }, []);
  return stops;
}
