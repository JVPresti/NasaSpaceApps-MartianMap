import { useSyncExternalStore } from 'react';
import { t, translateText, formatNumber } from '../i18n/index.js';
import { provenance } from '../data/provenance.js';
import SourceTag from '../plan/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import { missionForObjective } from '../sim/missions.js';
import { radiationRatePath, stormTauPath } from '../mission/sources.js';
import './events.css';

const ORDER = { danger: 4, warning: 3, caution: 2, info: 1 };

// Registry paths whose entry gives both the caption and the tag of an event value (#196). The tag ignores the live
// store entry (source={null}), so the words and the tag always come from the same registry entry. The radiation rate
// switches to the SIM step entry while one of our steps shows (radiationRatePath, #295).
export const EVENT_VALUE_PATHS = Object.freeze({
  'dust-storm': 'environment.dustOpacity',
  radiation: 'events.radiation.doseRateUgyH',
});

/** Caption of a registry entry, translated, with the " · " that joins it to the value. Empty when unknown. */
export function eventCaption(path, registry = provenance) {
  const caption = registry.lookup(path)?.caption;
  return caption ? ' · ' + translateText(caption) : '';
}

function EventValue({ path, children }) {
  useSyncExternalStore(provenance.subscribe, provenance.getVersion, provenance.getVersion);
  return (
    <span>
      {children}{eventCaption(path)}<SourceTag path={path} source={null} interactive={false} requireSource={false} />
    </span>
  );
}

function formatMargin(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  return t('ui.p0.p1.min', { p0: minutes >= 0 ? '+' : '−', p1: Math.abs(minutes) });
}

/**
 * Event alert strip: the one place an alert shows, in Plan's alert region and in Walk under the heading box.
 * `className` adds a placement class, for example `event-banner-walk`.
 */
export default function EventBanner({ className = '' }) {
  const alerts = useMissionStore((s) => s.alerts);
  const environment = useMissionStore((s) => s.environment);
  const suit = useMissionStore((s) => s.suit);
  const route = useMissionStore((s) => s.route);
  // The first mission plays the storm on a shortened ramp: its opacity carries that mission's SIM entry (#265, P19).
  const missionId = useMissionStore((s) => missionForObjective(s.needs?.objective).id);

  // The most severe alert first; between alerts of one level the newest, so a radiation alert that starts during the
  // dust storm is the one read (#265), with the storm counted in "+1 more alert".
  const active = Object.values(alerts)
    .filter((alert) => alert && alert.active)
    .sort((a, b) => ((ORDER[b.level] ?? 0) - (ORDER[a.level] ?? 0)) || ((b.startedAtSec ?? 0) - (a.startedAtSec ?? 0)));

  if (active.length === 0) return null;
  const alert = active[0];
  const skipped = route.skipped ?? [];

  return (
    <div className={`event-banner ${translateText(alert.level)}${className ? ' ' + className : ''}`} role="alert" aria-live="assertive">
      <div className="event-banner-main">
        <span className="event-level">{translateText(alert.level)}</span>
        <span className="event-text">{translateText(alert.text)}</span>
      </div>
      <div className="event-banner-meta">
        {alert.eventId === 'dust-storm' && (
          <EventValue path={stormTauPath(missionId, EVENT_VALUE_PATHS['dust-storm'])}>τ {formatNumber(environment.dustOpacity, 2)}</EventValue>
        )}
        {alert.eventId === 'radiation' && (
          <>
            {/* A rate RAD measured is DATA, one of our steps between them SIM (#295). */}
            <EventValue path={radiationRatePath(environment.doseRateUgyH, EVENT_VALUE_PATHS.radiation)}>{formatNumber(environment.doseRateUgyH, 1)}{t('ui.gy.h')}</EventValue>
            {/* The dose this EVA carries its own DERIVED tag: the rates over the minutes the event plays, not the 2017 dose. */}
            <span>{formatNumber(environment.doseUgy, 1)} {t('ui.gy')}<SourceTag path="environment.doseUgy" interactive={false} /></span>
          </>
        )}
        {String(alert.eventId).startsWith('low-oxygen') && (
          <span>{t('ui.margin')}{formatMargin(suit.marginSec)}{t('ui.30.min.reserve.hazards.json')}<SourceTag path="suit.marginSec" interactive={false} />
          </span>
        )}
        {skipped.length > 0 && <span>{t('ui.skipped')}{skipped.join(' · ')}</span>}
        {active.length > 1 && <span>{t(active.length > 2 ? 'moreAlerts' : 'moreAlert', { count: active.length - 1 })}</span>}
      </div>
    </div>
  );
}
