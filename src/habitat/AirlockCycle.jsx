import { t } from '../i18n/index.js';
import { AIRLOCK_CYCLE_MS, AIRLOCK_DARK_AT } from '../state/flow.js';
import './habitat.css';

const STEPS = {
  out: ['airlock.out.step1', 'airlock.out.step2', 'airlock.out.step3'],
  in: ['airlock.in.step1', 'airlock.in.step2', 'airlock.in.step3'],
};

/**
 * The airlock cycle on screen (habitat-first flow): the view goes dark, a short progress bar and three steps run,
 * then the view comes back on the other side of the hatch. The timing lives in App (runAirlockCycle in
 * src/state/flow.js), which moves the player while the screen is dark. This component only draws: the bar and the
 * steps are CSS animations with the same length, paused with the mission (`running`), so React renders it once per
 * cycle, never per frame.
 *
 * @param {{ direction: 'out' | 'in', running: boolean }} props
 */
export default function AirlockCycle({ direction, running }) {
  const steps = STEPS[direction] ?? STEPS.out;
  const style = {
    '--cycle-ms': `${AIRLOCK_CYCLE_MS}ms`,
    '--dark-at': AIRLOCK_DARK_AT,
    animationPlayState: running ? 'running' : 'paused',
  };
  return (
    <div className={`airlock airlock-${direction}`} style={style} role="status" aria-live="polite">
      <div className="airlock-panel" style={{ animationPlayState: style.animationPlayState }}>
        <p className="airlock-kicker">{t('airlock.kicker')}</p>
        <h2 className="airlock-title">{t(direction === 'in' ? 'airlock.in.title' : 'airlock.out.title')}</h2>
        <ol className="airlock-steps">
          {steps.map((key, i) => (
            <li key={key} style={{ '--step': i, animationPlayState: style.animationPlayState }}>{t(key)}</li>
          ))}
        </ol>
        <div className="airlock-bar" aria-hidden="true">
          <i style={{ animationPlayState: style.animationPlayState }} />
        </div>
        <p className="airlock-note">{t('airlock.note')}</p>
      </div>
    </div>
  );
}
