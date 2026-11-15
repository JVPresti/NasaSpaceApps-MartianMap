import { t, translateText } from '../i18n/index.js';
import ControlsHelp from './ControlsHelp.jsx';
import Modal from './Modal.jsx';

/**
 * The post-loading start screen. It is a modal dialog, so the scene and top bar behind it are inert.
 * Start captures the mouse in the click itself; the app resumes the mission only after the lock is real.
 * After a refused capture in Walk it also offers drag-to-look (#197); once chosen, Start skips the capture.
 */
export default function StartScreen({ mode = 'walk', busy, notice, freeLook = false, lockFailed = false, onStart, onStartWithoutCapture }) {
  const capture = mode === 'walk' && !freeLook;
  return (
    <Modal labelledBy="start-title" className="start-dialog" onCancel={() => {}}>
      <div className="dialog-body">
        <p className="dialog-kicker">{t('app.brand')}</p>
        <h2 id="start-title" className="dialog-title">{t('ui.cheyava.falls')}</h2>
        <p className="dialog-site">{t('ui.neretva.vallis.jezero.crater.mars')}</p>

        <p className="dialog-mission">{t('menu.walk.to.cheyava.falls.and.sample.the.science')}</p>
        <p className="dialog-source">{t('menu.start.position.sim.the.foot.of.the.habitat')}</p>

        <ControlsHelp />

        {notice && <p className="dialog-notice" role="alert">{translateText(notice)}</p>}

        <div className="dialog-actions">
          <button type="button" className="ui-button primary" onClick={onStart} disabled={busy} data-autofocus="true">
            {busy ? (capture ? t('menu.capturing.the.mouse') : t('menu.opening')) : mode === 'plan' ? t('menu.start.in.plan.view') : t('menu.start.eva')}
          </button>
          {capture && lockFailed && (
            <button type="button" className="ui-button ghost" onClick={onStartWithoutCapture} disabled={busy}>
              {t('menu.continue.without.mouse.capture')}
            </button>
          )}
        </div>
        <p className="dialog-footnote">
          {mode === 'plan'
            ? t('menu.plan.view.resumes.without.capturing.the.mouse.the')
            : freeLook ? t('menu.drag.to.look.start') : t('menu.start.captures.the.mouse.for.looking.around.the')}
        </p>
      </div>
    </Modal>
  );
}
