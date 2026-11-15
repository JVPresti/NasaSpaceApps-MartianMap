import { t } from '../i18n/index.js';
import { useReturnZone } from './useReturnZone.js';
import { zoneStatus } from './zoneStatus.js';

/**
 * The return zone legend's lines on what bounds it: what sets the edge now, and the budget ("Your plan: 30 min, 15 %
 * time reserve · 30 min O2 reserve · 100 % O2 · reach 610 m · 4 m cells"). Inside the legend, so an event banner over
 * the map never hides why the zone shrank.
 */
export default function ZoneLegendLine() {
  const status = zoneStatus(useReturnZone(true));
  if (!status) return <p className="zone-legend-line">{t('layers.zone.waiting')}</p>;
  return (
    <p className="zone-legend-line" role="status" aria-live="polite">
      <b>{status.limit}</b>
      <span>{status.head} · {status.reach} · {t('layers.zone.cells')}</span>
    </p>
  );
}
