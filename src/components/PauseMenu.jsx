import { t, translateText, setLanguage } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { useEffect, useRef } from 'react';
import ControlsHelp from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
import ModeSwitch from './ModeSwitch.jsx';
import { FOCUSABLE, focusTarget } from './focus.js';

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
 * Pause dialog. One native modal holds the menu, controls help and restart confirmation, so focus stays
 * inside it and the scene behind is inert. Esc closes a sub-view; on the menu it keeps the pause in Walk
 * (a key press cannot capture the mouse) and resumes in Plan, which needs no lock.
 */
export default function PauseMenu({
  view,
  mode,
  busy,
  notice,
  focusToken,
  quality,
  qualityBusy,
  qualityError,
  onResume,
  onRestartRequest,
  onRestartConfirm,
  onControls,
  onSources,
  onMenu,
  onQuality,
  onModeChange,
  onCancel,
}) {
  const language = useLanguage();
  const resumeRef = useRef(null);
  const backRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    // While the browser answers a resume the primary action is disabled and cannot take focus, so the
    // dialog itself keeps it and Enter would do nothing. Focus the primary as soon as it can take focus
    // again, including when the dialog was (re)opened during an attempt that has just ended.
    if (busy) return;
    const primary = view === 'controls' ? backRef.current : view === 'restart' ? cancelRef.current : resumeRef.current;
    const dialog = primary?.closest?.('dialog') || null;
    const target = focusTarget(primary, dialog ? [...dialog.querySelectorAll(FOCUSABLE)] : []);
    target?.focus();
    // focusToken lets the menu move focus back to its primary action when Escape keeps the pause instead of resuming.
  }, [busy, view, focusToken]);

  const selected = quality && !quality.pending ? (quality.auto ? 'auto' : quality.tier) : null;
  const qualityDisabled = !quality || qualityBusy || quality.pending;

  return (
    <Modal
      labelledBy={view === 'controls' ? 'pause-controls-title' : view === 'restart' ? 'pause-restart-title' : 'pause-menu-title'}
      className="pause-dialog"
      onCancel={onCancel}
    >
      {view === 'menu' && (
        <div className="dialog-body">
          <p className="dialog-kicker">{t('app.brand')}</p>
          <h2 id="pause-menu-title" className="dialog-title">{t('menu.eva.paused')}</h2>
          <p className="dialog-site">
            {mode === 'plan' ? t('menu.plan.view') : t('menu.walk.view')}{t('menu.mission.clock.paused')}</p>

          <div className="pause-view-switch" inert={busy ? true : undefined}>
            <span>{t('menu.view')}</span>
            <ModeSwitch mode={mode} onChange={onModeChange} />
          </div>

          <div className="menu-actions">
            <button
              type="button"
              className="ui-button primary"
              ref={resumeRef}
              data-autofocus="true"
              onClick={onResume}
              disabled={busy}
            >
              {busy ? (mode === 'plan' ? t('menu.resuming') : t('menu.capturing.the.mouse')) : t('resume')}
            </button>
            <button type="button" className="ui-button ghost" onClick={onRestartRequest} disabled={busy}>{t('menu.restart.eva')}</button>
            <button type="button" className="ui-button ghost" onClick={onControls} disabled={busy}>{t('menu.controls')}</button>
            <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy}>{t('ui.sources.188')}</button>
            <p id="sources-note" className="menu-note">{t('menu.credits.and.the.data.artistic.and.modelled.sources')}</p>
          </div>

          {notice && <p className="dialog-notice" role="alert">{translateText(notice)}</p>}

          <div className="language-block">
            <label htmlFor="interface-language">{t('language')}</label>
            <select id="interface-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en" lang="en">{t('english')}</option>
              <option value="es" lang="es">{t('spanish')}</option>
            </select>
            <p className="menu-note">{t('languageHelp')}</p>
          </div>

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
            {quality?.gpu && <p className="quality-device">{t('menu.gpu')}{quality.gpu}</p>}
            {qualityError && <p className="dialog-error" role="alert">{translateText(qualityError)}</p>}
          </div>

          {mode === 'plan' && <p className="dialog-footnote">{t('menu.plan.resumes.without.capturing.the.mouse')}</p>}
        </div>
      )}

      {view === 'controls' && (
        <div className="dialog-body">
          <p className="dialog-kicker">{t('app.brand')}</p>
          <h2 id="pause-controls-title" className="dialog-title">{t('menu.controls')}</h2>
          <ControlsHelp />
          <div className="dialog-actions">
            <button type="button" className="ui-button primary" ref={backRef} data-autofocus="true" onClick={onMenu}>{t('menu.back.to.pause.menu')}</button>
          </div>
        </div>
      )}

      {view === 'restart' && (
        <div className="dialog-body">
          <p className="dialog-kicker">{t('app.brand')}</p>
          <h2 id="pause-restart-title" className="dialog-title">{t('menu.restart.eva')}</h2>
          <p className="dialog-mission" id="restart-warning">{t('menu.this.resets.your.position.route.alerts.suit.and')}</p>
          <div className="dialog-actions">
            <button type="button" className="ui-button ghost" ref={cancelRef} data-autofocus="true" onClick={onMenu} disabled={busy}>{t('menu.cancel')}</button>
            <button type="button" className="ui-button danger" onClick={onRestartConfirm} disabled={busy} aria-describedby="restart-warning">
              {busy ? t('menu.restarting') : t('menu.restart.eva')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
