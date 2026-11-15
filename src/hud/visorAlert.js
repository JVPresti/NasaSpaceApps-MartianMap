// Visor alert ring (#28): the edge glow has three states. The event engine writes alerts with four levels
// (src/sim/eventEngine.js); danger and warning share the red ring, caution is amber, info and no alert show none.

export const VISOR_ALERT = Object.freeze({ NONE: 'none', CAUTION: 'caution', WARNING: 'warning' });

const RING = { danger: VISOR_ALERT.WARNING, warning: VISOR_ALERT.WARNING, caution: VISOR_ALERT.CAUTION };
const RANK = { [VISOR_ALERT.NONE]: 0, [VISOR_ALERT.CAUTION]: 1, [VISOR_ALERT.WARNING]: 2 };

/**
 * The ring state for the store's `alerts` map: the most severe active alert wins.
 * @param {Record<string, { level?: string, active?: boolean } | null> | null | undefined} alerts
 * @returns {'none' | 'caution' | 'warning'}
 */
export function visorAlertLevel(alerts) {
  let level = VISOR_ALERT.NONE;
  if (!alerts || typeof alerts !== 'object') return level;
  for (const alert of Object.values(alerts)) {
    if (!alert || alert.active !== true) continue;
    const ring = RING[alert.level];
    if (ring && RANK[ring] > RANK[level]) level = ring;
  }
  return level;
}
