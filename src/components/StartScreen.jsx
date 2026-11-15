import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef, useState } from 'react';
import homeMp4 from '../assets/ui/home.mp4';
import homeWebm from '../assets/ui/home.webm';
import poster from '../assets/ui/surface.webp';
import { ControlsPanel } from './ControlsHelp.jsx';
import Modal from './Modal.jsx';
import { FOCUSABLE, focusTarget } from './focus.js';
import { presentHref, presentLabel } from '../present/entry.js';

/**
 * The start screen (#11): the title over a looping video of an astronaut walking on Mars (AI-generated, credited in
 * Sources as artistic; the first frame is the poster and stays still with reduced motion) and one main action, which
 * puts the astronaut on foot inside the habitat, next to the mission table (habitat-first flow).
 * It is the first screen (#266): App mounts it before the scene is ready, so the video and text show at once, while
 * the scene loads behind it. The main action stays unavailable until then and shows the real progress; Controls and
 * Sources already work. It is a modal dialog, so the scene behind it is inert (App also hides the top
 * bar and the table while it is open). Nothing runs behind it: the EVA's clock, suit and events start when the
 * airlock cycle after Begin EVA ends. Walking in the habitat needs the mouse, so the click captures it; after a refused
 * capture the screen offers drag-to-look (#197).
 * The main action enters the habitat on the first mission (the first sortie, #265). `onFullEva`, when given, adds one
 * secondary button that enters it on the full EVA instead (the Cheyava Falls objective); the table's objective can
 * change either until Begin EVA.
 * @param {{ busy: boolean, notice: string|null, freeLook?: boolean, lockFailed?: boolean,
 *   scene?: { status: string, stage?: string, progress?: number }|null,
 *   onStart: () => void, onStartWithoutCapture?: () => void, onFullEva?: () => void, onSources?: () => void }} props
 *   scene is App's load state. A null scene counts as ready, so a caller that already has the engine can use the screen as it was.
 */
export default function StartScreen({ busy, notice, freeLook = false, lockFailed = false, scene = null, onStart, onStartWithoutCapture, onFullEva, onSources }) {
  const [controls, setControls] = useState(false);
  const startRef = useRef(null);
  const closeRef = useRef(null);
  const ready = scene == null || scene.status === 'ready';
  const progress = Math.min(1, Math.max(0, Number(scene?.progress) || 0));
  const percent = Math.round(progress * 100);

  // Modal focuses the marked primary only when it opens. Switching between the intro and the controls replaces the
  // focused button, so focus the new view's primary as well: Enter must always have a button to press (#207).
  // While the scene loads the primary is disabled, so focus goes to Controls; it moves to the primary when the
  // scene becomes ready and the main action can be pressed.
  useEffect(() => {
    if (busy) return;
    const primary = controls ? closeRef.current : startRef.current;
    const dialog = primary?.closest?.('dialog') || null;
    focusTarget(primary, dialog ? [...dialog.querySelectorAll(FOCUSABLE)] : [])?.focus();
  }, [busy, controls, ready]);

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
              <button
                type="button"
                className="start-primary"
                ref={startRef}
                onClick={onStart}
                disabled={busy || !ready}
                aria-busy={busy || !ready}
                data-autofocus="true"
              >
                {ready
                  ? (busy ? (freeLook ? t('menu.opening') : t('menu.capturing.the.mouse')) : t('menu.enter.habitat'))
                  : t('menu.loading.scene', { p0: percent })}
                {!ready && (
                  <span className="start-progress" aria-hidden="true">
                    <span className="start-progress-fill" style={{ transform: `scaleX(${progress})` }} />
                  </span>
                )}
              </button>
              {lockFailed && !freeLook && onStartWithoutCapture && (
                <button type="button" className="ui-button ghost" onClick={onStartWithoutCapture} disabled={busy}>
                  {t('menu.continue.without.mouse.capture')}
                </button>
              )}
              {onFullEva && (
                <button type="button" className="ui-button ghost start-full" onClick={onFullEva} disabled={busy || !ready}>
                  {t('mission.start.full')}
                </button>
              )}
              <button type="button" className="ui-button ghost" onClick={() => setControls(true)}>{t('menu.controls')}</button>
              {onSources && <button type="button" className="ui-button ghost" onClick={onSources}>{t('ui.sources.188')}</button>}
              <a className="ui-button ghost start-present" href={presentHref()}>{presentLabel()}</a>
            </div>
            {!ready && (
              <p className="start-status" role="status">
                {translateText(scene?.stage) || t('menu.loading.scene', { p0: percent })}
              </p>
            )}
            {freeLook && <p className="start-note">{t('menu.drag.to.look.table')}</p>}
          </div>
          <p className="start-credit">{t('menu.start.credit')}</p>
        </div>
        </>
      )}
    </Modal>
  );
}
