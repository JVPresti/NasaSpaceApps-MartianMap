// One line on a return zone for the map: where it is computed from, with what O2 and time, what closes it.
import { formatNumber, t } from '../i18n/index.js';
import { shortDuration } from '../plan/tableFormat.js';

const EVENT_NAMES = { 'dust-storm': 'stormLabel', radiation: 'radiationLabel' };

/** One line on the zone: where from, with what O2 and time, what closes it, how far it reaches. */
export function zoneStatus(zone) {
  if (!zone) return null;
  const { inputs, stats } = zone;
  const o2Pct = Math.round((100 * inputs.o2G) / inputs.o2UsableG);
  const timeLeft = Math.max(0, inputs.evaLimitSec - inputs.elapsedSec);
  const head = zone.kind === 'live'
    ? t('layers.zone.status.live', { o2: o2Pct, time: shortDuration(timeLeft) })
    : t('layers.zone.status.plan', { o2: o2Pct, time: shortDuration(inputs.evaLimitSec) });
  const event = zone.events?.[0];
  const limit = stats.limit === 'event'
    ? t('layers.zone.limit.event', { event: event && EVENT_NAMES[event] ? t(EVENT_NAMES[event]) : event ?? '' })
    : t('layers.zone.limit.' + (stats.limit ?? 'none'));
  return { head, limit, reach: t('layers.zone.reach', { m: formatNumber(Math.round(stats.reachM / 10) * 10, 0) }) };
}

