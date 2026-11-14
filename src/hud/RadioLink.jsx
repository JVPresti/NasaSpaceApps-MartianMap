import { useEffect, useState } from 'react';
import { useMissionStore } from '../state/store.js';
import { radioLinkState } from '../sim/radio.js';
import * as I from './icons.jsx';

const LABEL = { linked: 'LINK', weak: 'WEAK', lost: 'NO LINK' };

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
      if (!mast || !Number.isFinite(nav.x) || !Number.isFinite(nav.z)) {
        setLink(null);
        return;
      }
      setLink(radioLinkState({ point: nav, mast, lineOfSight: engine.lineOfSight }));
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [engine]);

  if (!link) return null;
  return (
    <div className={`hud-radio hud-radio-${link.state}`} role="status" aria-label={`Radio link ${LABEL[link.state]}, habitat ${Math.round(link.rangeM)} metres`}>
      <I.Radio />
      <b>{LABEL[link.state]}</b>
      <small>{Math.round(link.rangeM)} m</small>
    </div>
  );
}
