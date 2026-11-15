import { t } from '../i18n/index.js';
import { useEffect, useState } from 'react';
import SharedSourceTag from '../components/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import { radioLinkState } from '../sim/radio.js';
import { truePosition } from '../sim/navigation.js';
import * as I from './icons.jsx';

const LABEL = { get linked() { return t('linked'); }, get weak() { return t('weak'); }, get lost() { return t('ui.no.link'); } };
const hudSrc = (tag) => 'hud-src hud-src-' + tag;

/**
 * Direct radio link to the habitat mast (#74): line of sight through the
 * terrain, polled a few times per second.
 */
export default function RadioLink({ engine }) {
  const [link, setLink] = useState(null);

  useEffect(() => {
    if (!engine) return undefined;
    const update = () => {
      const nav = useMissionStore.getState().navigation;
      const mast = engine.getHabitatMast();
      // The link is a measurement: the signal travels from where the astronaut really is (#42).
      const point = truePosition(nav);
      if (!mast || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        setLink(null);
        return;
      }
      setLink(radioLinkState({ point, mast, lineOfSight: engine.lineOfSight }));
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [engine]);

  return link ? <RadioChip link={link} /> : null;
}

/**
 * The chip for one link state. One source tag after the range covers the range and the state, as the navigation line
 * has one for its figures: both are DERIVED, and the tag's title says the weak range is our choice (#297).
 * @param {{ link: { state: 'linked' | 'weak' | 'lost', rangeM: number } }} props
 */
export function RadioChip({ link }) {
  return (
    <div className={`hud-radio hud-radio-${link.state}`} role="status" aria-label={t('ui.radio.link.p0.habitat.p1.metres', { p0: LABEL[link.state], p1: Math.round(link.rangeM) })}>
      <I.Radio />
      <b>{LABEL[link.state]}</b>
      <small>{Math.round(link.rangeM)}{t('units.metresSuffix')}</small>
      <SharedSourceTag path="radio.link" variant="tag" interactive={false} className={hudSrc} />
    </div>
  );
}
