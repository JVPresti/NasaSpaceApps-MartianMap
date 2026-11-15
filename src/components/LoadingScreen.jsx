import { t, translateText } from '../i18n/index.js';
import { useEffect, useRef } from 'react';

/**
 * Failure panel for the scene (#266). The start screen shows first and the scene loads behind it, so this panel
 * appears only when that load fails: the reason and the file that broke, with Try again.
 * Try again remounts the engine and returns to the start screen, where the new progress is shown.
 */
export default function LoadingScreen({ state, site, onRetry }) {
  const { status, error } = state;
  const retryRef = useRef(null);

  useEffect(() => {
    if (status === 'error') retryRef.current?.focus();
  }, [status]);

  // App mounts this component only for a failure; keep a stray loading state from drawing an empty error panel.
  if (status !== 'error') return null;

  return (
    <div className="loading-screen">
      <section className="loading-panel error" role="alert">
        <p className="loading-kicker">{t('app.brand')}</p>
        <h2 className="loading-title">{t('ui.cheyava.falls')}</h2>
        <p className="loading-site">{site}</p>

        <div className="loading-error">
          <p className="loading-error-title">{t('ui.the.scene.could.not.start')}</p>
          <p className="loading-error-message">{error?.code === 'ASSET_LOAD_FAILED' ? t('loadAsset', { file: error.file }) : error?.code === 'WEBGL2_UNSUPPORTED' ? t('unsupported') : translateText(error?.message) || t('ui.an.unknown.error.stopped.the.scene')}</p>
          {error?.detail && !error.message?.includes(error.detail) && (
            <p className="loading-error-detail">{error.code === 'WEBGL2_UNSUPPORTED' ? t('unsupportedHelp') : translateText(error.detail)}</p>
          )}
          <button ref={retryRef} type="button" className="loading-retry" onClick={onRetry}>{t('ui.try.again')}</button>
        </div>
      </section>
    </div>
  );
}
