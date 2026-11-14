import { useMissionStore } from '../state/store.js';
import './events.css';

const ORDER = { danger: 4, warning: 3, caution: 2, info: 1 };

function formatMargin(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  return `${minutes >= 0 ? '+' : '−'}${Math.abs(minutes)} min`;
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
    <div className={`event-banner ${alert.level}`} role="alert" aria-live="assertive">
      <div className="event-banner-main">
        <span className="event-level">{alert.level}</span>
        <span className="event-text">{alert.text}</span>
      </div>
      <div className="event-banner-meta">
        {alert.eventId === 'dust-storm' && (
          <span>τ {environment.dustOpacity?.toFixed(2) ?? '—'} · MEDA 2022 storm profile</span>
        )}
        {alert.eventId === 'radiation' && (
          <span>
            {environment.doseRateUgyH?.toFixed(1) ?? '—'} µGy/h · {environment.doseUgy?.toFixed(1) ?? '—'} µGy
            · RAD · Curiosity · Gale crater, not Jezero
          </span>
        )}
        {String(alert.eventId).startsWith('low-oxygen') && (
          <span>Margin {formatMargin(suit.marginSec)} · 30 min reserve · hazards.json</span>
        )}
        {skipped.length > 0 && <span>Skipped: {skipped.join(' · ')}</span>}
        {active.length > 1 && <span>+{active.length - 1} more alert{active.length > 2 ? 's' : ''}</span>}
      </div>
    </div>
  );
}
