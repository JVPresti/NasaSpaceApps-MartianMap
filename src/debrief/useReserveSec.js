import { useEffect, useState } from 'react';
import { loadDataFile } from '../data/dataFiles.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';

let request = null;

/**
 * The suit reserve in seconds (hazards.json suit.reserve.time, read by the suit model), for the route review rules in
 * the debrief (#274). null until the file is read; it is already cached by then, since the suit model loaded it.
 */
export function useReserveSec() {
  const [reserveSec, setReserveSec] = useState(null);
  useEffect(() => {
    let alive = true;
    request ??= loadDataFile(HAZARDS_PATH)
      .then((hazards) => suitConstantsFromHazards(hazards).reserveSec)
      .catch(() => { request = null; return null; });
    request.then((value) => { if (alive) setReserveSec(value); });
    return () => { alive = false; };
  }, []);
  return reserveSec;
}
