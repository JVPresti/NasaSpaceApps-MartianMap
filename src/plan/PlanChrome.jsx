import { formatScaleLength, niceScaleLength } from '../engine/planView.js';

/**
 * North arrow and a scale bar whose width follows the camera zoom.
 * @param {{ metresPerPixel: number }} props
 */
export default function PlanChrome({ metresPerPixel }) {
  const bar = niceScaleLength(120, metresPerPixel);
  return (
    <div className="plan-chrome" aria-label="Map orientation and scale">
      <div className="north-arrow" title="North is up">
        <svg viewBox="0 0 24 36" aria-hidden="true">
          <path d="M12 1 21 33 12 26 3 33Z" />
        </svg>
        <span>N</span>
      </div>
      <div className="scale-bar" aria-label={bar.metres ? `Scale bar ${formatScaleLength(bar.metres)}` : 'Scale bar'}>
        <div className="scale-bar-line" style={{ width: `${Math.round(bar.px)}px` }} />
        <span>{bar.metres ? formatScaleLength(bar.metres) : '—'}</span>
      </div>
    </div>
  );
}
