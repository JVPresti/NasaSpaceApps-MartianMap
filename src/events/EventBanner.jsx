import { t, translateText, formatNumber } from '../i18n/index.js';
import SourceTag from '../plan/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import './events.css';

const ORDER = { danger: 4, warning: 3, caution: 2, info: 1 };

function formatMargin(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  return t('ui.p0.p1.min', { p0: minutes >= 0 ? '+' : '−', p1: Math.abs(minutes) });
}

/**
 * Minimal event alert strip. It reads the store contract that #20 will use for
 * the full visor HUD, so the same alerts appear here now and in the HUD later.
 */
export default function EventBanner() {
  const alerts = useMissionStore((s) => s.alerts);
  const environment = useMissionStore((s) => s.environment);
  const suit = useMissionStore((s) => s.suit);
  const route = useMissionStore((s) => s.route);

  const active = Object.values(alerts)
    .filter((alert) => alert && alert.active)
    .sort((a, b) => (ORDER[b.level] ?? 0) - (ORDER[a.level] ?? 0));

  if (active.length === 0) return null;
  const alert = active[0];
  const skipped = route.skipped ?? [];

  return (
    <div className={`event-banner ${translateText(alert.level)}`} role="alert" aria-live="assertive">
      <div className="event-banner-main">
        <span className="event-level">{translateText(alert.level)}</span>
        <span className="event-text">{translateText(alert.text)}</span>
      </div>
      <div className="event-banner-meta">
        {alert.eventId === 'dust-storm' && (
          <span>
            τ {formatNumber(environment.dustOpacity, 2)}{t('ui.global.storm.profile.up.to.curiosity.s.gale')}<SourceTag path="environment.dustOpacity" interactive={false} requireSource={false} />
          </span>
        )}
        {alert.eventId === 'radiation' && (
          <span>
            {formatNumber(environment.doseRateUgyH, 1)}{t('ui.gy.h')}{formatNumber(environment.doseUgy, 1)}{t('ui.gy.rad.curiosity.gale.crater.not.jezero')}<SourceTag path="environment.doseRateUgyH" interactive={false} requireSource={false} />
          </span>
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
