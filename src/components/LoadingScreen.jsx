import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef, useState } from 'react';

const FADE_MS = 420;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Centred loading panel with real file progress, an explainable error state, and a fade that starts
 * only once App has received the engine's first-frame ready signal.
 */
export default function LoadingScreen({ state, site, onRetry, onGone }) {
  const { status, stage, progress, loaded, total, error } = state;
  const retryRef = useRef(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    // App remounts this component on retry, so a transition that was interrupted cannot leak here.
    const delay = prefersReducedMotion() ? 0 : FADE_MS;
    const timer = setTimeout(() => { setGone(true); onGone?.(); }, delay);
    return () => clearTimeout(timer);
  }, [status, onGone]);

  useEffect(() => {
    if (status === 'error') retryRef.current?.focus();
  }, [status]);

  const failed = status === 'error';
  if (gone && !failed) return null;

  const leaving = status === 'ready';
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const valueText = total > 0
    ? t('ui.p0.percent.p1.of.p2.files.loaded', { p0: percent, p1: loaded, p2: total })
    : t('ui.p0.percent', { p0: percent });

  return (
    <div className={'loading-screen' + (leaving ? ' leaving' : '')}>
      <section
        className={'loading-panel' + (failed ? ' error' : '')}
        role={failed ? 'alert' : undefined}
        aria-busy={status === 'loading'}
      >
        <p className="loading-kicker">{t('app.brand')}</p>
        <h2 className="loading-title">{t('ui.cheyava.falls')}</h2>
        <p className="loading-site">{site}</p>

        {failed ? (
          <div className="loading-error">
            <p className="loading-error-title">{t('ui.the.scene.could.not.start')}</p>
            <p className="loading-error-message">{error?.code === 'ASSET_LOAD_FAILED' ? t('loadAsset', { file: error.file }) : error?.code === 'WEBGL2_UNSUPPORTED' ? t('unsupported') : translateText(error?.message) || t('ui.an.unknown.error.stopped.the.scene')}</p>
            {error?.detail && !error.message?.includes(error.detail) && (
              <p className="loading-error-detail">{error.code === 'WEBGL2_UNSUPPORTED' ? t('unsupportedHelp') : translateText(error.detail)}</p>
            )}
            <button ref={retryRef} type="button" className="loading-retry" onClick={onRetry}>{t('ui.try.again')}</button>
          </div>
        ) : (
          <>
            <p className="loading-stage" role="status">{translateText(stage)}</p>
            <div
              className="loading-track"
              role="progressbar"
              aria-label={t('ui.scene.assets')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={valueText}
            >
              <div className="loading-fill" style={{ transform: `scaleX(${Math.max(0, progress)})` }} />
            </div>
            <div className="loading-meta">
              <span>{total > 0 ? t('files', { loaded, total }) : t('ui.preparing.assets')}</span>
              <span className="loading-percent">{percent}%</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
