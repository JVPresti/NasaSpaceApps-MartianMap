// One line on a return zone for the map: the budget that bounds it, what closes it now, how far it reaches.
import { formatNumber, t } from '../i18n/index.js';
import { shortDuration } from '../plan/tableFormat.js';

const EVENT_NAMES = { 'dust-storm': 'stormLabel', radiation: 'radiationLabel' };
const eventName = (id) => (id && EVENT_NAMES[id] ? t(EVENT_NAMES[id]) : id ?? '');

/**
 * @param {object | null} zone the zone service's zone (computeReturnZone plus kind, events, windowSec and the plan's budget)
 * @returns {{ head: string, limit: string, reach: string } | null} head: the budget ("Your plan: 30 min, 15 % time
 *   reserve, 30 min O2 reserve"); limit: what sets the edge now; reach: the farthest ground in reach
 */
export function zoneStatus(zone) {
  if (!zone) return null;
  const { inputs, stats, budget } = zone;
  const o2Reserve = Math.round(inputs.reserveSec / 60);
  const o2 = Math.round((100 * inputs.o2G) / inputs.o2UsableG);
  let head;
  if (zone.kind === 'live') {
    head = t('layers.zone.status.live', { time: shortDuration(Math.max(0, inputs.evaLimitSec - inputs.elapsedSec)), o2, reserve: o2Reserve });
  } else if (budget && Number.isFinite(budget.availableSec)) {
    head = t('layers.zone.status.plan', {
      time: shortDuration(budget.availableSec), share: Math.round((100 * (budget.reserveSec ?? 0)) / budget.availableSec), reserve: o2Reserve, o2,
    });
  } else {
    head = t('layers.zone.status.suit', { time: shortDuration(inputs.evaLimitSec), reserve: o2Reserve });
  }
  const event = zone.events?.find((id) => id === 'radiation' && stats.limit === 'window') ?? zone.events?.[0];
  let limit;
  if (stats.limit === 'window') {
    const left = Math.round(inputs.shelterWithinSec ?? 0);
    limit = left > 0 ? t('layers.zone.limit.window', { event: eventName(event), sec: left }) : t('layers.zone.limit.window.closed', { event: eventName(event) });
  } else if (stats.limit === 'event') limit = t('layers.zone.limit.event', { event: eventName(event) });
  else limit = t('layers.zone.limit.' + (stats.limit ?? 'none'));
  return { head, limit, reach: t('layers.zone.reach', { m: formatNumber(Math.round(stats.reachM / 10) * 10, 0) }) };
}
