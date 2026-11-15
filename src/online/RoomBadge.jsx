import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { useMissionStore } from '../state/store.js';
import { statusLabel } from './onlineText.js';
import './online.css';

/** The Walk corner badge: room code and connection status. Renders nothing offline. */
export default function RoomBadge() {
  useLanguage();
  const code = useMissionStore((s) => s.online.code);
  const status = useMissionStore((s) => s.online.status);
  if (code === null) return null;
  return (
    <p className={'room-badge status-' + status} role="status" aria-label={t('online.badge.label', { code, status: statusLabel(status) })}>
      <code>{code}</code>
      <i aria-hidden="true" />
      <span>{statusLabel(status)}</span>
    </p>
  );
}
