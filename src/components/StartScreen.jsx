import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef, useState } from 'react';
import homeMp4 from '../assets/ui/home.mp4';
import homeWebm from '../assets/ui/home.webm';
import poster from '../assets/ui/surface.webp';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
import { FOCUSABLE, focusTarget } from './focus.js';

/**
 * The start screen (#11): the title over a looping video of an astronaut walking on Mars (AI-generated, credited in
 * Sources as artistic; the first frame is the poster and stays still with reduced motion) and one main action, which
 * puts the astronaut inside the habitat next to the mission table (habitat-first flow). Controls and Sources are
 * secondary. It is a modal dialog, so the scene behind it is inert. Nothing runs behind it: the EVA's clock, suit and
 * events start when the airlock cycle after Begin EVA ends. Walking in the habitat needs the mouse, so the click
 * captures it; after a refused capture the screen offers drag-to-look (#197).
 */
export default function StartScreen({ busy, notice, freeLook = false, lockFailed = false, onStart, onStartWithoutCapture, onSources }) {
  const [controls, setControls] = useState(false);
  const startRef = useRef(null);
  const closeRef = useRef(null);

  // Modal focuses the marked primary only when it opens. Switching between the intro and the controls replaces the
  // focused button, so focus the new view's primary as well: Enter must always have a button to press (#207).
  useEffect(() => {
    if (busy) return;
    const primary = controls ? closeRef.current : startRef.current;
    const dialog = primary?.closest?.('dialog') || null;
    focusTarget(primary, dialog ? [...dialog.querySelectorAll(FOCUSABLE)] : [])?.focus();
  }, [busy, controls]);

  return (
    <Modal labelledBy={controls ? 'start-controls-title' : 'start-title'} className={controls ? 'start-dialog showing-controls' : 'start-dialog'} onCancel={() => setControls(false)}>
      {controls ? (
        <div className="start-controls">
          <ControlsPanel titleId="start-controls-title" onClose={() => setControls(false)} closeRef={closeRef} />
        </div>
      ) : (
        <>
        <video className="start-video" autoPlay muted loop playsInline preload="auto" poster={poster} aria-hidden="true" tabIndex={-1}>
          <source src={homeWebm} type="video/webm" />
          <source src={homeMp4} type="video/mp4" />
        </video>
        <div className="start-shade" aria-hidden="true" />
        <div className="start-layout">
          <div className="start-hero">
            <p className="start-kicker">{t('app.brand')}</p>
            <h2 id="start-title" className="start-title">{t('ui.cheyava.falls')}</h2>
            <p className="start-text">{t('menu.start.intro')}</p>
            <p className="start-text">{t('menu.start.in.habitat')}</p>

            {notice && <p className="dialog-notice" role="alert">{translateText(notice)}</p>}

            <div className="start-actions">
              <button type="button" className="start-primary" ref={startRef} onClick={onStart} disabled={busy} data-autofocus="true">
                {busy ? (freeLook ? t('menu.opening') : t('menu.capturing.the.mouse')) : t('menu.enter.habitat')}
              </button>
              {lockFailed && !freeLook && onStartWithoutCapture && (
                <button type="button" className="ui-button ghost" onClick={onStartWithoutCapture} disabled={busy}>
                  {t('menu.continue.without.mouse.capture')}
                </button>
              )}
              <button type="button" className="ui-button ghost" onClick={() => setControls(true)}>{t('menu.controls')}</button>
              {onSources && <button type="button" className="ui-button ghost" onClick={onSources}>{t('ui.sources.188')}</button>}
            </div>
            {freeLook && <p className="start-note">{t('menu.drag.to.look.table')}</p>}
          </div>
          <p className="start-credit">{t('menu.start.credit')}</p>
        </div>
        </>
      )}
    </Modal>
  );
}
