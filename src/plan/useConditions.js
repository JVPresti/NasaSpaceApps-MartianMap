import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { loadDataFile } from '../data/dataFiles.js';
import { HAZARDS_PATH } from '../data/provenance.js';
import { useMissionStore } from '../state/store.js';
import { dustAgainstLimit } from './outlook.js';

/** A data file under public/, through the shared loader (#217); null until it loads or when it fails. */
export function useDataFile(path) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadDataFile(path).then((json) => !cancelled && setValue(json)).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);
  return value;
}

/**
 * The dust opacity the crew would walk in, against the terrain-fix limit (#248): the store's opacity once something
 * wrote it with a source (the environment runner from Begin EVA, the dust storm), else the clear-season opacity of
 * Jezero (hazards.json dust.tau.clear_season; the store's starting 0 is not a measurement). The limit is
 * dust.event.nav_fix_tau_max. Null until hazards.json has loaded.
 * @returns {{ tau: number, limit: number, over: boolean, measured: boolean } | null}
 *   measured: the opacity is the store's (the EVA is running), not the clear-season value
 */
export function useDustAgainstLimit() {
  const hazards = useDataFile(HAZARDS_PATH);
  const { tau, hasSource } = useMissionStore(useShallow((s) => ({ tau: s.environment.dustOpacity, hasSource: Boolean(s.sources['environment.dustOpacity']) })));
  const measured = hasSource && Number.isFinite(tau);
  const result = dustAgainstLimit(measured ? tau : hazards?.values?.['dust.tau.clear_season']?.value, hazards?.values?.['dust.event.nav_fix_tau_max']?.value);
  return result ? { ...result, measured } : null;
}
