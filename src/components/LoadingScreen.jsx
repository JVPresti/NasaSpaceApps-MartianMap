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
export default function LoadingScreen({ state, site, onRetry }) {
  const { status, stage, progress, loaded, total, error } = state;
  const retryRef = useRef(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    // App remounts this component on retry, so a transition that was interrupted cannot leak here.
    const delay = prefersReducedMotion() ? 0 : FADE_MS;
    const timer = setTimeout(() => setGone(true), delay);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'error') retryRef.current?.focus();
  }, [status]);

  const failed = status === 'error';
  if (gone && !failed) return null;

  const leaving = status === 'ready';
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const valueText = total > 0
    ? `${percent} percent, ${loaded} of ${total} files loaded`
    : `${percent} percent`;

  return (
    <div className={'loading-screen' + (leaving ? ' leaving' : '')}>
      <section
        className={'loading-panel' + (failed ? ' error' : '')}
        role={failed ? 'alert' : undefined}
        aria-busy={status === 'loading'}
      >
        <p className="loading-kicker">Marswalk</p>
        <h2 className="loading-title">Cheyava Falls</h2>
        <p className="loading-site">{site}</p>

        {failed ? (
          <div className="loading-error">
            <p className="loading-error-title">The scene could not start</p>
            <p className="loading-error-message">{error?.message || 'An unknown error stopped the scene.'}</p>
            {error?.detail && !error.message?.includes(error.detail) && (
              <p className="loading-error-detail">{error.detail}</p>
            )}
            <button ref={retryRef} type="button" className="loading-retry" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <p className="loading-stage" role="status">{stage}</p>
            <div
              className="loading-track"
              role="progressbar"
              aria-label="Scene assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={valueText}
            >
              <div className="loading-fill" style={{ transform: `scaleX(${Math.max(0, progress)})` }} />
            </div>
            <div className="loading-meta">
              <span>{total > 0 ? `${loaded} / ${total} files` : 'Preparing assets'}</span>
              <span className="loading-percent">{percent}%</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
