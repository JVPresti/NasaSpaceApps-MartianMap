import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef } from 'react';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { FOCUSABLE, focusTarget } from './focus.js';

/**
 * Pause dialog (#11 design). There is no Plan / Walk switch: once the EVA has begun, End the EVA goes back to the
 * mission table with a fresh EVA. One native modal holds the menu, controls help, settings and restart confirmation, so focus stays
 * inside it and the scene behind is inert. Esc closes a sub-view; on the menu it keeps the pause in Walk
 * (a key press cannot capture the mouse) and resumes in Plan, which needs no lock. After a refused capture in Walk
 * the menu also offers drag-to-look (#197).
 */
export default function PauseMenu({
  view,
  mode,
  evaBegun = false,
  busy,
  notice,
  freeLook = false,
  lockFailed = false,
  focusToken,
  quality,
  qualityBusy,
  qualityError,
  controlsToMenu = true,
  onResume,
  onResumeWithoutCapture,
  onRestartRequest,
  onRestartConfirm,
  onControls,
  onControlsClose,
  onSettings,
  onSources,
  onMenu,
  onQuality,
  onEndRequest,
  onEndConfirm,
  onCancel,
}) {
  const resumeRef = useRef(null);
  const backRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    // While the browser answers a resume the primary action is disabled and cannot take focus, so the
    // dialog itself keeps it and Enter would do nothing. Focus the primary as soon as it can take focus
    // again, including when the dialog was (re)opened during an attempt that has just ended.
    if (busy) return;
    const primary = view === 'controls' || view === 'settings' ? backRef.current : view === 'restart' || view === 'end' ? cancelRef.current : resumeRef.current;
    const dialog = primary?.closest?.('dialog') || null;
    const target = focusTarget(primary, dialog ? [...dialog.querySelectorAll(FOCUSABLE)] : []);
    target?.focus();
    // focusToken lets the menu move focus back to its primary action when Escape keeps the pause instead of resuming.
  }, [busy, view, focusToken]);

  const capture = mode === 'walk' && !freeLook;

  return (
    <Modal
      labelledBy={view === 'controls' ? 'pause-controls-title' : view === 'settings' ? 'pause-settings-title' : view === 'menu' ? 'pause-menu-title' : 'pause-confirm-title'}
      className={view === 'controls' ? 'pause-dialog controls-dialog' : 'pause-dialog'}
      onCancel={onCancel}
    >
      {view === 'menu' && (
        <div className="dialog-body">
          <h2 id="pause-menu-title" className="dialog-title">
            {evaBegun || mode === 'walk' ? t('menu.eva.paused') : t('menu.planning.paused')}
          </h2>

          <div className="menu-actions">
            <button
              type="button"
              className="ui-button primary menu-resume"
              ref={resumeRef}
              data-autofocus="true"
              onClick={onResume}
              disabled={busy}
            >
              {busy ? (capture ? t('menu.capturing.the.mouse') : t('menu.resuming')) : t('resume')}
            </button>
            {capture && lockFailed && (
              <button type="button" className="ui-button ghost" onClick={onResumeWithoutCapture} disabled={busy}>
                {t('menu.continue.without.mouse.capture')}
              </button>
            )}
            <button type="button" className="ui-button ghost" onClick={onControls} disabled={busy}>
              {t('menu.controls')}
            </button>
            <button type="button" className="ui-button ghost" onClick={onSettings} disabled={busy}>
              {t('menu.settings')}
            </button>
            <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy} title={t('menu.credits.and.the.data.artistic.and.modelled.sources')}>
              {t('ui.sources.188')}
            </button>
            <button type="button" className="ui-button ghost" onClick={onRestartRequest} disabled={busy}>
              {t('menu.restart.the.eva')}
            </button>
            {evaBegun && (
              <button type="button" className="ui-button ghost" onClick={onEndRequest} disabled={busy}>
                {t('menu.end.eva.to.table')}
              </button>
            )}
          </div>

          {notice && <p className="dialog-notice" role="alert">{translateText(notice)}</p>}

          {mode === 'walk' && freeLook && <p className="dialog-footnote">{t('menu.drag.to.look.pause')}</p>}
        </div>
      )}

      {view === 'settings' && (
        <SettingsPanel
          titleId="pause-settings-title"
          busy={busy}
          quality={quality}
          qualityBusy={qualityBusy}
          qualityError={qualityError}
          onQuality={onQuality}
          onClose={onMenu}
          closeRef={backRef}
        />
      )}

      {view === 'controls' && (
        <ControlsPanel
          titleId="pause-controls-title"
          onClose={onControlsClose ?? onMenu}
          closeRef={backRef}
          closeLabel={controlsToMenu ? t('menu.back.to.pause.menu') : undefined}
        />
      )}

      {(view === 'restart' || view === 'end') && (
        <div className="dialog-body">
          <p className="dialog-kicker">{view === 'end' ? t('menu.end.eva') : t('menu.restart.kicker')}</p>
          <h2 id="pause-confirm-title" className="dialog-title">{view === 'end' ? t('menu.end.title') : t('menu.restart.title')}</h2>
          <p className="dialog-mission" id="confirm-warning">
            {view === 'end' ? t('menu.end.warning') : t('menu.this.resets.your.position.route.alerts.suit.and')}
          </p>
          <div className="dialog-actions">
            <button type="button" className="ui-button ghost" ref={cancelRef} data-autofocus="true" onClick={onMenu} disabled={busy}>
              {t('menu.cancel')}
            </button>
            <button
              type="button"
              className="ui-button danger"
              onClick={view === 'end' ? onEndConfirm : onRestartConfirm}
              disabled={busy}
              aria-describedby="confirm-warning"
            >
              {busy ? t('menu.working') : view === 'end' ? t('menu.end.eva') : t('menu.restart.the.eva')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
