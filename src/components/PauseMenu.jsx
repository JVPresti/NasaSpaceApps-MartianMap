import { formatNumber, t, translateText, setLanguage } from '../i18n/index.js';
import { useLanguage } from '../i18n/useLanguage.js';
import { useEffect, useRef } from 'react';
import AudioSettings from '../audio/AudioSettings.jsx';
import { LOOK_SENSITIVITY_MAX, LOOK_SENSITIVITY_MIN, LOOK_SENSITIVITY_STEP } from '../engine/lookSettings.js';
import { setLookSettings, useMissionStore } from '../state/store.js';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
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
 * Pause dialog (#11 design). There is no Plan / Walk switch: once the EVA has begun, End the EVA goes back to the
 * mission table with a fresh EVA. One native modal holds the menu, controls help and restart confirmation, so focus stays
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
  onSources,
  onMenu,
  onQuality,
  onEndRequest,
  onEndConfirm,
  onCancel,
}) {
  const language = useLanguage();
  const look = useMissionStore((s) => s.settings.look);
  // Online (9.5) the room owns the mission clock: this menu does not stop it or the events.
  const sharedClock = useMissionStore((s) => typeof s.mission.sharedStartMs === 'number');
  const resumeRef = useRef(null);
  const backRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    // While the browser answers a resume the primary action is disabled and cannot take focus, so the
    // dialog itself keeps it and Enter would do nothing. Focus the primary as soon as it can take focus
    // again, including when the dialog was (re)opened during an attempt that has just ended.
    if (busy) return;
    const primary = view === 'controls' ? backRef.current : view === 'restart' || view === 'end' ? cancelRef.current : resumeRef.current;
    const dialog = primary?.closest?.('dialog') || null;
    const target = focusTarget(primary, dialog ? [...dialog.querySelectorAll(FOCUSABLE)] : []);
    target?.focus();
    // focusToken lets the menu move focus back to its primary action when Escape keeps the pause instead of resuming.
  }, [busy, view, focusToken]);

  const selected = quality && !quality.pending ? (quality.auto ? 'auto' : quality.tier) : null;
  const qualityDisabled = !quality || qualityBusy || quality.pending;
  const capture = mode === 'walk' && !freeLook;

  return (
    <Modal
      labelledBy={view === 'controls' ? 'pause-controls-title' : view === 'menu' ? 'pause-menu-title' : 'pause-confirm-title'}
      className={view === 'controls' ? 'pause-dialog controls-dialog' : 'pause-dialog'}
      onCancel={onCancel}
    >
      {view === 'menu' && (
        <div className="dialog-body">
          <p className="dialog-kicker">{sharedClock ? t('online.pause.kicker') : t('menu.mission.clock.paused.kicker')}</p>
          <h2 id="pause-menu-title" className="dialog-title">
            {sharedClock ? t('online.pause.title') : evaBegun || mode === 'walk' ? t('menu.eva.paused') : t('menu.planning.paused')}
          </h2>
          {sharedClock && <p className="dialog-mission">{t('online.pause.note')}</p>}

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

          {mode === 'walk' && freeLook && <p className="dialog-footnote">{t('menu.drag.to.look.pause')}</p>}
        </div>
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
