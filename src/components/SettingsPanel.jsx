import { formatNumber, setLanguage, t, translateText } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import AudioSettings from '../audio/AudioSettings.jsx';
import { LOOK_SENSITIVITY_MAX, LOOK_SENSITIVITY_MIN, LOOK_SENSITIVITY_STEP } from '../engine/lookSettings.js';
import { setLookSettings, useMissionStore } from '../state/store.js';

const QUALITY = [
  ['auto', 'menu.auto'],
  ['high', 'menu.high'],
  ['low', 'menu.low'],
];

function qualityLabel(quality) {
  if (!quality) return t('menu.reading.scene.quality');
  if (quality.pending) return t('menu.applying.scene.quality');
  return quality.auto ? t('menu.auto.tier', { tier: translateText(quality.tier) }) : translateText(quality.tier);
}

/**
 * The settings view of the pause dialog (PAUSE_VIEW.SETTINGS), laid out like the controls help: a title, the way back
 * to the pause menu, then the interface language, suit audio, scene quality and mouse look. They used to sit under the
 * pause menu's actions, which made the menu long; each one still saves as before.
 * @param {{ titleId: string, busy?: boolean, quality: object | null, qualityBusy?: boolean, qualityError?: string | null,
 *   onQuality: (id: string) => void, onClose: () => void, closeRef?: import('react').Ref<HTMLButtonElement> }} props
 */
export default function SettingsPanel({ titleId, busy = false, quality, qualityBusy = false, qualityError = null, onQuality, onClose, closeRef }) {
  const language = useLanguage();
  const look = useMissionStore((s) => s.settings.look);
  const selected = quality && !quality.pending ? (quality.auto ? 'auto' : quality.tier) : null;
  const qualityDisabled = !quality || qualityBusy || quality.pending;

  return (
    <div className="dialog-body settings-panel">
      <div className="dialog-head">
        <h2 id={titleId} className="dialog-title">{t('menu.settings')}</h2>
        <button type="button" className="ui-button ghost" ref={closeRef} data-autofocus="true" onClick={onClose}>
          {t('menu.back.to.pause.menu')}
        </button>
      </div>

      <div className="language-block">
        <label htmlFor="interface-language">{t('language')}</label>
        <select id="interface-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en" lang="en">{t('english')}</option>
          <option value="es" lang="es">{t('spanish')}</option>
        </select>
        <p className="menu-note">{t('languageHelp')}</p>
      </div>

      <AudioSettings />

      <div className="quality-block">
        <h3 id="quality-label">{t('menu.scene.quality')}</h3>
        <div className="quality-options" role="group" aria-labelledby="quality-label" aria-describedby="quality-status">
          {QUALITY.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={selected === id ? 'on' : undefined}
              aria-pressed={selected === id}
              disabled={qualityDisabled}
              onClick={() => onQuality(id)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <p id="quality-status" className="quality-status" role="status" aria-live="polite">
          {qualityBusy ? t('menu.changing.scene.quality') : qualityLabel(quality)}
        </p>
        {qualityError && <p className="dialog-error" role="alert">{translateText(qualityError)}</p>}
      </div>

      <div className="look-block">
        <h3>{t('menu.look')}</h3>
        <div className="look-sensitivity-head">
          <label htmlFor="look-sensitivity">{t('menu.look.sensitivity')}</label>
          {/* The range input announces its own value; the output is visual only, so no aria-live here. */}
          <output htmlFor="look-sensitivity" className="look-value">
            {formatNumber(look.sensitivity, 1) + '×'}
          </output>
        </div>
        <input
          id="look-sensitivity"
          type="range"
          min={LOOK_SENSITIVITY_MIN}
          max={LOOK_SENSITIVITY_MAX}
          step={LOOK_SENSITIVITY_STEP}
          value={look.sensitivity}
          aria-describedby="look-help"
          disabled={busy}
          onChange={(event) => setLookSettings({ sensitivity: Number(event.target.value) })}
        />
        <label className="look-invert">
          <input
            type="checkbox"
            checked={look.invertY}
            aria-describedby="look-help"
            disabled={busy}
            onChange={(event) => setLookSettings({ invertY: event.target.checked })}
          />
          <span>{t('menu.look.invert')}</span>
        </label>
        <p id="look-help" className="menu-note">{t('menu.look.saved')}</p>
      </div>
    </div>
  );
}
