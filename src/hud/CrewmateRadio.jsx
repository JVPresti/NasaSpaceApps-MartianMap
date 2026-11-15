// EV2's radio line on the visor (#288): the crewmate's last callout under the partner chip, shown for 8 s.
// The callouts come from src/sim/crewmate.js through comms.partner (src/state/crewmate.js). A number in a line carries
// the tag of the store path it was read from, so the visor says where it comes from, as everywhere else on the HUD.
import { useEffect, useState } from 'react';
import SharedSourceTag from '../components/SourceTag.jsx';
import { useLanguage } from '../i18n/useLanguage.js';
import { useMissionStore } from '../state/store.js';
import { calloutText, RADIO_SHOW_MS } from './crewmateRadioText.js';
import './crewmateRadio.css';

const hudSrc = (tag) => 'hud-src hud-src-' + tag;

export default function CrewmateRadio() {
  useLanguage();
  const callout = useMissionStore((s) => s.comms?.partner ?? null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!callout) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setTimeout(tick, Math.max(0, (callout.atMs ?? 0) + RADIO_SHOW_MS - Date.now()) + 20);
    return () => { clearTimeout(first); clearTimeout(timer); };
  }, [callout]);
  if (!callout || !(now - (callout.atMs ?? 0) < RADIO_SHOW_MS)) return null;
  const path = Object.values(callout.sources ?? {})[0];
  return (
    <div className={'hud-panel hud-crew-radio' + (callout.urgent ? ' hud-crew-radio-urgent' : '')} role="status" aria-live="polite">
      <span>{calloutText(callout)}</span>
      {path && <SharedSourceTag path={path} variant="tag" interactive={false} className={hudSrc} />}
    </div>
  );
}
