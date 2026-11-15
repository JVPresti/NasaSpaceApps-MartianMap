import { t } from '../i18n/index.js';
import { useMissionStore } from '../state/store.js';
import './online.css';

/**
 * What the habitat seat says on the visor (#55): "New route from <name>" when its route becomes the active one, and a
 * go or no-go banner with the reason. Both read `habitat.notice` and `habitat.go` (src/net/habitat.js); offline the
 * slice is empty and this renders nothing.
 */
export default function HabitatCalls() {
  const notice = useMissionStore((s) => s.habitat?.notice ?? null);
  const go = useMissionStore((s) => s.habitat?.go ?? null);
  if (!notice) return null;
  const name = notice.name || t('online.habitat.someone');
  if (notice.key === 'route') {
    return <div className="online-visor-notice" role="status">{t('online.habitat.notice.route', { name })}</div>;
  }
  const isGo = notice.key === 'go';
  return (
    <div className={'online-visor-call ' + (isGo ? 'is-go' : 'is-no-go')} role="alert">
      <b>{t(isGo ? 'online.habitat.call.go' : 'online.habitat.call.nogo', { name })}</b>
      {go?.why && <span>{go.why}</span>}
    </div>
  );
}
