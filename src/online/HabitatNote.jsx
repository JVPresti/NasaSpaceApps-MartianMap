import { t } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import './online.css';

/** In place of Begin EVA for the habitat seat: it stays at the table (#55; M4 adds the map tools). */
export default function HabitatNote() {
  useLanguage();
  return (
    <div className="table-panel online-habitat">
      <p className="table-label">{t('online.role.habitat')}</p>
      <p className="table-text small">{t('online.habitat.note')}</p>
    </div>
  );
}
