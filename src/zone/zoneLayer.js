// The return zone's entry in the map layer list (src/plan/layers.js), kept here so the zone's text and colours live
// with the zone. Plain data: layers.js registers its provenance and gives it to the table's buttons and legend.
import { t } from '../i18n/index.js';
import { ZONE_ORANGE } from './zonePaint.js';

/** Caution margin of hazards.json suit.alert.caution_margin, minutes; the zone service reads the live value. */
const CAUTION_MIN = 15;

export const ZONE_LAYER = {
  id: 'zone',
  index: 6,
  walk: false,   // the ground in Walk stays plain; the minimap and the wrist map draw the zone instead
  decides: 'layers.decides.zone',
  provenance: {
    tag: 'DERIVED', label: 'HiRISE DTM + suit model',
    source: 'two Dijkstra passes over the HiRISE height grid in 3.8 m x 4 m cells, each step priced with the suit model (walking_metabolic, hazards.json); inside: the margin at the cell after walking there and back stays over 0 min with the 30 min O2 reserve; edge: under the 15 min caution margin (SIM threshold). src/sim/returnZone.js',
  },
  get name() { return t('layers.zone'); },
  get unit() { return t('layers.zone.unit'); },
  get summary() { return t('layers.zone.summary'); },
  get source() { return t('layers.zone.source'); },
  get swatches() {
    return [
      { color: '#000000', clear: true, label: t('layers.zone.inside'), detail: t('layers.zone.inside.detail') },
      { color: ZONE_ORANGE, label: t('layers.zone.edge'), detail: t('layers.zone.edge.detail', { min: CAUTION_MIN }) },
      { color: '#5a4434', label: t('layers.zone.outside'), detail: t('layers.zone.outside.detail') },
    ];
  },
};
