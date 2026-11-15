import { t } from '../i18n/index.js';
import { formatScaleLength, niceScaleLength } from '../engine/planView.js';

/**
 * North arrow and a scale bar whose width follows the camera zoom.
 * @param {{ metresPerPixel: number }} props
 */
export default function PlanChrome({ metresPerPixel }) {
  const bar = niceScaleLength(120, metresPerPixel);
  return (
    <div className="plan-chrome" aria-label={t('ui.map.orientation.and.scale')}>
      <div className="north-arrow" title={t('ui.north.is.up')}>
        <svg viewBox="0 0 24 36" aria-hidden="true">
          <path d="M12 1 21 33 12 26 3 33Z" />
        </svg>
        <span>{t('ui.n')}</span>
      </div>
      <div className="scale-bar" aria-label={bar.metres ? t('ui.scale.bar.p0', { p0: formatScaleLength(bar.metres) }) : t('ui.scale.bar')}>
        <div className="scale-bar-line" style={{ width: `${Math.round(bar.px)}px` }} />
        <span>{bar.metres ? formatScaleLength(bar.metres) : '—'}</span>
      </div>
    </div>
  );
}
